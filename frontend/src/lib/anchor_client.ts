/**
 * Anchor program client for PacificaOptions.
 * All on-chain transactions go through this class.
 */
import {
  Program,
  AnchorProvider,
  BN,
  web3,
} from '@coral-xyz/anchor';
import {
  Connection,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import type { WalletContextState } from '@solana/wallet-adapter-react';
import type { PacificaOptions } from '../../../target/types/pacifica_options';

import IDL from './pacifica_options_idl.json';
import {
  PROGRAM_ID,
  USDC_MINT,
  SOLANA_RPC,
  SCALE,
  PLATFORM_FEE_BPS,
  BPS_DENOM,
} from './constants';
import { MARKET_DISCRIMINANTS, OPTION_TYPE_DISCRIMINANTS } from '@/types';
import type { Market, OptionType, OptionPositionAccount, PositionStatus } from '@/types';
type Position = OptionPositionAccount;

const PROGRAM_PUBKEY   = new PublicKey(PROGRAM_ID);
const USDC_MINT_PUBKEY = new PublicKey(USDC_MINT);

// ── PDA helpers ───────────────────────────────────────────────────────────────

export function findVaultPDA(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), authority.toBuffer()],
    PROGRAM_PUBKEY,
  );
}

export function findVaultUsdcPDA(vault: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vault_usdc'), vault.toBuffer()],
    PROGRAM_PUBKEY,
  );
}

export function findIVOraclePDA(vault: PublicKey, marketDisc: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('iv_oracle'), vault.toBuffer(), Buffer.from([marketDisc])],
    PROGRAM_PUBKEY,
  );
}

export function findAmmPoolPDA(
  vault: PublicKey,
  marketDisc: number,
  optionTypeDisc: number,
  strike: BN,
  expiry: BN,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('amm_pool'),
      vault.toBuffer(),
      Buffer.from([marketDisc]),
      Buffer.from([optionTypeDisc]),
      strike.toArrayLike(Buffer, 'le', 8),
      expiry.toArrayLike(Buffer, 'le', 8),
    ],
    PROGRAM_PUBKEY,
  );
}

export function findPositionPDA(
  owner: PublicKey,
  vault: PublicKey,
  marketDisc: number,
  optionTypeDisc: number,
  strike: BN,
  expiry: BN,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('position'),
      owner.toBuffer(),
      vault.toBuffer(),
      Buffer.from([marketDisc]),
      Buffer.from([optionTypeDisc]),
      strike.toArrayLike(Buffer, 'le', 8),
      expiry.toArrayLike(Buffer, 'le', 8),
    ],
    PROGRAM_PUBKEY,
  );
}

export function findLPPositionPDA(owner: PublicKey, pool: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('lp_position'), owner.toBuffer(), pool.toBuffer()],
    PROGRAM_PUBKEY,
  );
}

export function findVaultLPPositionPDA(owner: PublicKey, vault: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vault_lp_position'), owner.toBuffer(), vault.toBuffer()],
    PROGRAM_PUBKEY,
  );
}

export function findVlpMintPDA(vault: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vlp_mint'), vault.toBuffer()],
    PROGRAM_PUBKEY,
  );
}

// ── Client ────────────────────────────────────────────────────────────────────

export class PacificaOptionsClient {
  private connection: Connection;
  private wallet: WalletContextState;
  private _provider: AnchorProvider | null = null;
  private _program: Program<PacificaOptions> | null = null;

  constructor(wallet: WalletContextState) {
    this.connection = new Connection(SOLANA_RPC, 'confirmed');
    this.wallet = wallet;
  }

  private get provider(): AnchorProvider {
    if (!this.wallet.publicKey || !this.wallet.signTransaction) {
      throw new Error('Wallet not connected');
    }
    if (!this._provider) {
      this._provider = new AnchorProvider(
        this.connection,
        this.wallet as any,
        { commitment: 'confirmed', preflightCommitment: 'confirmed' },
      );
    }
    return this._provider;
  }

  private get program(): Program<PacificaOptions> {
    if (!this._program) {
      this._program = new Program<PacificaOptions>(IDL as any, this.provider);
    }
    return this._program;
  }

  get publicKey(): PublicKey | null {
    return this.wallet.publicKey;
  }

  // ── Fee helpers ─────────────────────────────────────────────────────────────

  static computeFee(premiumUsdc: number): number {
    return (premiumUsdc * PLATFORM_FEE_BPS) / BPS_DENOM;
  }

  static computeFeeOnchain(premiumScaled: BN): BN {
    return premiumScaled.muln(PLATFORM_FEE_BPS).divn(BPS_DENOM);
  }

  // ── Vault state ─────────────────────────────────────────────────────────────

  async getVaultState(authority: PublicKey) {
    const [vault] = findVaultPDA(authority);
    try {
      return await this.program.account.optionVault.fetch(vault);
    } catch {
      return null;
    }
  }

  async getIVOracle(vaultAuthority: PublicKey, market: Market) {
    const [vault] = findVaultPDA(vaultAuthority);
    const [oracle] = findIVOraclePDA(vault, MARKET_DISCRIMINANTS[market]);
    try {
      return await this.program.account.ivOracle.fetch(oracle);
    } catch {
      return null;
    }
  }

  async getPosition(
    vaultAuthority: PublicKey,
    market: Market,
    optionType: OptionType,
    strikeUsdc: number,
    expiry: number,
  ) {
    if (!this.wallet.publicKey) return null;
    const [vault]    = findVaultPDA(vaultAuthority);
    const strike     = new BN(Math.round(strikeUsdc * SCALE));
    const expiryBN   = new BN(expiry);
    const [position] = findPositionPDA(
      this.wallet.publicKey, vault,
      MARKET_DISCRIMINANTS[market], OPTION_TYPE_DISCRIMINANTS[optionType],
      strike, expiryBN,
    );
    try {
      return await this.program.account.optionPosition.fetch(position);
    } catch {
      return null;
    }
  }

  // ── Ensure Series ───────────────────────────────────────────────────────────
  // Idempotent: initializes ammPool + position PDAs for (user, series).
  // Must be called before the first buyOption for a given series.

  async ensureSeries(params: {
    vaultAuthority: PublicKey;
    market: Market;
    optionType: OptionType;
    strikeUsdc: number;
    expiry: number;
  }): Promise<string> {
    if (!this.wallet.publicKey) throw new Error('Wallet not connected');
    const payer = this.wallet.publicKey;

    const marketDisc  = MARKET_DISCRIMINANTS[params.market];
    const optTypeDisc = OPTION_TYPE_DISCRIMINANTS[params.optionType];
    const strike      = new BN(Math.round(params.strikeUsdc * SCALE));
    const expiry      = new BN(params.expiry);

    const [vault]    = findVaultPDA(params.vaultAuthority);
    const [ammPool]  = findAmmPoolPDA(vault, marketDisc, optTypeDisc, strike, expiry);
    const [position] = findPositionPDA(payer, vault, marketDisc, optTypeDisc, strike, expiry);

    return await this.program.methods
      .ensureSeries({
        marketDiscriminant: marketDisc,
        optionType: optTypeDisc,
        strike,
        expiry,
      })
      .accounts({
        vault,
        ammPool,
        position,
        payer,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      } as any)
      .rpc();
  }

  // ── Buy Option ──────────────────────────────────────────────────────────────
  // Automatically calls ensureSeries first if the ammPool or position PDAs
  // don't exist yet (first trade for this series/user).

  async buyOption(params: {
    vaultAuthority: PublicKey;
    market: Market;
    optionType: OptionType;
    strikeUsdc: number;
    expiry: number;
    sizeUnderlying: number;
    maxPremiumUsdc: number;
  }): Promise<string> {
    if (!this.wallet.publicKey) throw new Error('Wallet not connected');
    const buyer = this.wallet.publicKey;

    const marketDisc  = MARKET_DISCRIMINANTS[params.market];
    const optTypeDisc = OPTION_TYPE_DISCRIMINANTS[params.optionType];
    const strike      = new BN(Math.round(params.strikeUsdc * SCALE));
    const expiry      = new BN(params.expiry);
    const size        = new BN(Math.round(params.sizeUnderlying * SCALE));
    const maxPremium  = new BN(Math.round(params.maxPremiumUsdc * SCALE));

    const [vault]     = findVaultPDA(params.vaultAuthority);
    const [usdcVault] = findVaultUsdcPDA(vault);
    const [ivOracle]  = findIVOraclePDA(vault, marketDisc);
    const [ammPool]   = findAmmPoolPDA(vault, marketDisc, optTypeDisc, strike, expiry);
    const [position]  = findPositionPDA(buyer, vault, marketDisc, optTypeDisc, strike, expiry);
    const buyerUsdc   = await getAssociatedTokenAddress(USDC_MINT_PUBKEY, buyer);

    // Check if the series PDAs already exist; if not, initialize them first.
    const [ammInfo, posInfo] = await Promise.all([
      this.program.provider.connection.getAccountInfo(ammPool),
      this.program.provider.connection.getAccountInfo(position),
    ]);
    if (!ammInfo || !posInfo) {
      await this.ensureSeries(params);
    }

    return await this.program.methods
      .buyOption({
        marketDiscriminant: marketDisc,
        optionType: optTypeDisc,
        strike,
        expiry,
        size,
        maxPremium,
      })
      .accounts({
        vault,
        usdcVault,
        ammPool,
        ivOracle,
        position,
        buyerUsdc,
        buyer,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .rpc();
  }

  // ── Sell Option ─────────────────────────────────────────────────────────────

  async sellOption(params: {
    vaultAuthority: PublicKey;
    market: Market;
    optionType: OptionType;
    strikeUsdc: number;
    expiry: number;
    sizeUnderlying: number;
    minProceedsUsdc: number;
  }): Promise<string> {
    if (!this.wallet.publicKey) throw new Error('Wallet not connected');
    const seller = this.wallet.publicKey;

    const marketDisc  = MARKET_DISCRIMINANTS[params.market];
    const optTypeDisc = OPTION_TYPE_DISCRIMINANTS[params.optionType];
    const strike      = new BN(Math.round(params.strikeUsdc * SCALE));
    const expiry      = new BN(params.expiry);
    const size        = new BN(Math.round(params.sizeUnderlying * SCALE));
    const minProceeds = new BN(Math.round(params.minProceedsUsdc * SCALE));

    const [vault]    = findVaultPDA(params.vaultAuthority);
    const [usdcVault] = findVaultUsdcPDA(vault);
    const [ivOracle]  = findIVOraclePDA(vault, marketDisc);
    const [ammPool]   = findAmmPoolPDA(vault, marketDisc, optTypeDisc, strike, expiry);
    const [position]  = findPositionPDA(seller, vault, marketDisc, optTypeDisc, strike, expiry);
    const sellerUsdc  = await getAssociatedTokenAddress(USDC_MINT_PUBKEY, seller);

    return await this.program.methods
      .sellOption({
        marketDiscriminant: marketDisc,
        optionType: optTypeDisc,
        strike,
        expiry,
        size,
        minProceeds,
      })
      .accounts({
        vault,
        usdcVault,
        ammPool,
        ivOracle,
        position,
        sellerUsdc,
        seller,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .rpc();
  }

  // ── Exercise Option ─────────────────────────────────────────────────────────

  async exerciseOption(params: {
    vaultAuthority: PublicKey;
    market: Market;
    optionType: OptionType;
    strikeUsdc: number;
    expiry: number;
  }): Promise<string> {
    if (!this.wallet.publicKey) throw new Error('Wallet not connected');
    const owner = this.wallet.publicKey;

    const marketDisc  = MARKET_DISCRIMINANTS[params.market];
    const optTypeDisc = OPTION_TYPE_DISCRIMINANTS[params.optionType];
    const strike      = new BN(Math.round(params.strikeUsdc * SCALE));
    const expiry      = new BN(params.expiry);

    const [vault]    = findVaultPDA(params.vaultAuthority);
    const [usdcVault] = findVaultUsdcPDA(vault);
    const [ivOracle]  = findIVOraclePDA(vault, marketDisc);
    const [position]  = findPositionPDA(owner, vault, marketDisc, optTypeDisc, strike, expiry);
    const ownerUsdc   = await getAssociatedTokenAddress(USDC_MINT_PUBKEY, owner);

    return await this.program.methods
      .exerciseOption({
        marketDiscriminant: marketDisc,
        optionType: optTypeDisc,
        strike,
        expiry,
      })
      .accounts({
        vault,
        usdcVault,
        ivOracle,
        position,
        ownerUsdc,
        owner,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .rpc();
  }

  // ── Add Liquidity ───────────────────────────────────────────────────────────

  async addLiquidity(params: {
    vaultAuthority: PublicKey;
    market: Market;
    optionType: OptionType;
    strikeUsdc: number;
    expiry: number;
    usdcAmount: number;
    minLpTokens?: number;
  }): Promise<string> {
    if (!this.wallet.publicKey) throw new Error('Wallet not connected');
    const provider = this.wallet.publicKey;

    const marketDisc  = MARKET_DISCRIMINANTS[params.market];
    const optTypeDisc = OPTION_TYPE_DISCRIMINANTS[params.optionType];
    const strike      = new BN(Math.round(params.strikeUsdc * SCALE));
    const expiry      = new BN(params.expiry);
    const usdcAmount  = new BN(Math.round(params.usdcAmount * SCALE));
    const minLpTokens = new BN(Math.round((params.minLpTokens ?? 0) * SCALE));

    const [vault]      = findVaultPDA(params.vaultAuthority);
    const [usdcVault]  = findVaultUsdcPDA(vault);
    const [ammPool]    = findAmmPoolPDA(vault, marketDisc, optTypeDisc, strike, expiry);
    const [lpPosition] = findLPPositionPDA(provider, ammPool);
    const providerUsdc = await getAssociatedTokenAddress(USDC_MINT_PUBKEY, provider);

    return await this.program.methods
      .addLiquidity({
        marketDiscriminant: marketDisc,
        optionType: optTypeDisc,
        strike,
        expiry,
        usdcAmount,
        minLpTokens,
      })
      .accounts({
        vault,
        usdcVault,
        ammPool,
        lpPosition,
        providerUsdc,
        provider,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      } as any)
      .rpc();
  }

  // ── Read-only static helpers (no wallet needed) ─────────────────────────────

  /** Fetch ATM IV for all markets from on-chain oracles. Falls back to 0 on error. */
  static async getIVOraclesReadOnly(vaultAuthority: PublicKey): Promise<Record<Market, number>> {
    const connection = new Connection(SOLANA_RPC, 'confirmed');
    const dummyWallet = {
      publicKey: PublicKey.default,
      signTransaction: async (tx: web3.Transaction) => tx,
      signAllTransactions: async (txs: web3.Transaction[]) => txs,
    };
    const provider = new AnchorProvider(connection, dummyWallet as any, { commitment: 'confirmed' });
    const program = new Program<PacificaOptions>(IDL as any, provider);
    const [vault] = findVaultPDA(vaultAuthority);
    const allMarkets: Market[] = [
      'BTC', 'ETH', 'SOL',
      'NVDA', 'TSLA', 'PLTR', 'CRCL', 'HOOD', 'SP500',
      'XAU', 'XAG', 'PAXG', 'PLATINUM', 'NATGAS', 'COPPER',
    ];
    const result = Object.fromEntries(allMarkets.map((m) => [m, 0])) as Record<Market, number>;
    await Promise.all(
      allMarkets.map(async (market) => {
        const [oracle] = findIVOraclePDA(vault, MARKET_DISCRIMINANTS[market]);
        try {
          const data = await program.account.ivOracle.fetch(oracle);
          const raw = (data.ivAtm as unknown as BN).toNumber();
          if (raw > 0) result[market] = raw / SCALE;
        } catch {}
      }),
    );
    return result;
  }

  /** Fetch all open positions owned by `owner` from on-chain. */
  static async getPositionsByOwner(owner: PublicKey): Promise<Position[]> {
    const connection = new Connection(SOLANA_RPC, 'confirmed');
    const dummyWallet = {
      publicKey: PublicKey.default,
      signTransaction: async (tx: web3.Transaction) => tx,
      signAllTransactions: async (txs: web3.Transaction[]) => txs,
    };
    const provider = new AnchorProvider(connection, dummyWallet as any, { commitment: 'confirmed' });
    const program = new Program<PacificaOptions>(IDL as any, provider);
    // offset 9 = 8 bytes discriminator + 1 byte bump, then 32-byte owner pubkey
    const rawAccounts = await program.account.optionPosition.all([
      { memcmp: { offset: 9, bytes: owner.toBase58() } },
    ]);
    return rawAccounts.map(({ publicKey, account }) => {
      const a = account as any;
      const MARKET_FROM_ANCHOR: Record<string, Market> = {
        btc: 'BTC', eth: 'ETH', sol: 'SOL',
        nvda: 'NVDA', tsla: 'TSLA', pltr: 'PLTR',
        crcl: 'CRCL', hood: 'HOOD', sp500: 'SP500',
        xau: 'XAU', xag: 'XAG', paxg: 'PAXG',
        platinum: 'PLATINUM', natgas: 'NATGAS', copper: 'COPPER',
      };
      const anchorKey = Object.keys(a.market)[0];
      const market: Market = MARKET_FROM_ANCHOR[anchorKey] ?? 'BTC';
      const optionType: OptionType = 'call' in a.optionType ? 'Call' : 'Put';
      const settled = a.settled as boolean;
      const status: PositionStatus = settled ? 'settled' : 'open';
      return {
        pubkey:         publicKey.toBase58(),
        owner:          (a.owner as PublicKey).toBase58(),
        market,
        optionType,
        strike:         (a.strike as BN).toNumber() / SCALE,
        expiry:         new Date((a.expiry as BN).toNumber() * 1000),
        size:           (a.size as BN).toNumber() / SCALE,
        premiumPaid:    (a.premiumPaid as BN).toNumber() / SCALE,
        entryIv:        (a.entryIv as BN).toNumber() / SCALE,
        entryDelta:     (a.entryDelta as BN).toNumber() / SCALE,
        settled,
        payoffReceived: (a.payoffReceived as BN).toNumber() / SCALE,
        createdAt:      new Date((a.createdAt as BN).toNumber() * 1000),
        status,
      } as Position;
    });
  }

  // ── Remove Liquidity ────────────────────────────────────────────────────────

  async removeLiquidity(params: {
    vaultAuthority: PublicKey;
    market: Market;
    optionType: OptionType;
    strikeUsdc: number;
    expiry: number;
    lpTokens: number;
    minUsdcOut: number;
  }): Promise<string> {
    if (!this.wallet.publicKey) throw new Error('Wallet not connected');
    const provider = this.wallet.publicKey;

    const marketDisc  = MARKET_DISCRIMINANTS[params.market];
    const optTypeDisc = OPTION_TYPE_DISCRIMINANTS[params.optionType];
    const strike      = new BN(Math.round(params.strikeUsdc * SCALE));
    const expiry      = new BN(params.expiry);
    const lpTokens    = new BN(Math.round(params.lpTokens * SCALE));
    const minUsdcOut  = new BN(Math.round(params.minUsdcOut * SCALE));

    const [vault]      = findVaultPDA(params.vaultAuthority);
    const [usdcVault]  = findVaultUsdcPDA(vault);
    const [ammPool]    = findAmmPoolPDA(vault, marketDisc, optTypeDisc, strike, expiry);
    const [lpPosition] = findLPPositionPDA(provider, ammPool);
    const providerUsdc = await getAssociatedTokenAddress(USDC_MINT_PUBKEY, provider);

    return await this.program.methods
      .removeLiquidity({
        marketDiscriminant: marketDisc,
        optionType: optTypeDisc,
        strike,
        expiry,
        lpTokens,
        minUsdcOut,
      })
      .accounts({
        vault,
        usdcVault,
        ammPool,
        lpPosition,
        providerUsdc,
        provider,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .rpc();
  }

  // ── Global Vault LP (SPL token) ─────────────────────────────────────────────

  /** Returns the user's vLP SPL token balance (0 if no ATA yet). */
  async getVlpBalance(vaultAuthority: PublicKey): Promise<number> {
    if (!this.wallet.publicKey) return 0;
    const [vault]    = findVaultPDA(vaultAuthority);
    const [vlpMint]  = findVlpMintPDA(vault);
    const userVlpAta = await getAssociatedTokenAddress(vlpMint, this.wallet.publicKey);
    try {
      const bal = await this.connection.getTokenAccountBalance(userVlpAta);
      return parseFloat(bal.value.uiAmountString ?? '0');
    } catch {
      return 0;
    }
  }

  /** Returns the vLP mint pubkey stored in the vault (null if not initialized). */
  async getVlpMint(vaultAuthority: PublicKey): Promise<PublicKey | null> {
    const vault = await this.getVaultState(vaultAuthority);
    if (!vault) return null;
    const mint = vault.vlpMint as PublicKey;
    if (mint.equals(PublicKey.default)) return null;
    return mint;
  }

  /** Authority-only: creates the vLP SPL mint (call once after vault init). */
  async initializeVlpMint(params: { vaultAuthority: PublicKey }): Promise<string> {
    if (!this.wallet.publicKey) throw new Error('Wallet not connected');
    const [vault]   = findVaultPDA(params.vaultAuthority);
    const [vlpMint] = findVlpMintPDA(vault);

    return await this.program.methods
      .initializeVlpMint()
      .accounts({
        vault,
        vlpMint,
        authority: this.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      } as any)
      .rpc();
  }

  /**
   * Returns the USDC mint actually stored in the vault — the authoritative
   * source to use for ATA derivation.  Falls back to USDC_MINT_PUBKEY.
   */
  async getVaultUsdcMint(vaultAuthority: PublicKey): Promise<PublicKey> {
    try {
      const [vault] = findVaultPDA(vaultAuthority);
      const state   = await this.program.account.optionVault.fetch(vault);
      const mint    = state.usdcMint as PublicKey;
      if (!mint.equals(PublicKey.default)) return mint;
    } catch {}
    return USDC_MINT_PUBKEY;
  }

  async depositVault(params: {
    vaultAuthority: PublicKey;
    usdcAmount: number;
    minVlpTokens?: number;
  }): Promise<string> {
    if (!this.wallet.publicKey) throw new Error('Wallet not connected');
    const depositor = this.wallet.publicKey;

    const [vault]       = findVaultPDA(params.vaultAuthority);
    const [usdcVault]   = findVaultUsdcPDA(vault);
    const [vlpMint]     = findVlpMintPDA(vault);

    // Read the mint actually stored in the vault to avoid ConstraintTokenMint
    const usdcMint      = await this.getVaultUsdcMint(params.vaultAuthority);
    const depositorUsdc = await getAssociatedTokenAddress(usdcMint, depositor);
    const depositorVlp  = await getAssociatedTokenAddress(vlpMint, depositor);

    return await this.program.methods
      .depositVault({
        usdcAmount:   new BN(Math.round(params.usdcAmount * SCALE)),
        minVlpTokens: new BN(Math.round((params.minVlpTokens ?? 0) * SCALE)),
      })
      .accounts({
        vault,
        usdcVault,
        vlpMint,
        depositorVlp,
        depositorUsdc,
        depositor,
        tokenProgram:            TOKEN_PROGRAM_ID,
        associatedTokenProgram:  ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram:           SystemProgram.programId,
        rent:                    SYSVAR_RENT_PUBKEY,
      } as any)
      .rpc();
  }

  async withdrawVault(params: {
    vaultAuthority: PublicKey;
    vlpTokens: number;
    minUsdcOut?: number;
  }): Promise<string> {
    if (!this.wallet.publicKey) throw new Error('Wallet not connected');
    const withdrawer = this.wallet.publicKey;

    const [vault]        = findVaultPDA(params.vaultAuthority);
    const [usdcVault]    = findVaultUsdcPDA(vault);
    const [vlpMint]      = findVlpMintPDA(vault);
    const usdcMint       = await this.getVaultUsdcMint(params.vaultAuthority);
    const withdrawerUsdc = await getAssociatedTokenAddress(usdcMint, withdrawer);
    const withdrawerVlp  = await getAssociatedTokenAddress(vlpMint, withdrawer);

    return await this.program.methods
      .withdrawVault({
        vlpTokens:  new BN(Math.round(params.vlpTokens * SCALE)),
        minUsdcOut: new BN(Math.round((params.minUsdcOut ?? 0) * SCALE)),
      })
      .accounts({
        vault,
        usdcVault,
        vlpMint,
        withdrawerVlp,
        withdrawerUsdc,
        withdrawer,
        tokenProgram:           TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      } as any)
      .rpc();
  }
}
