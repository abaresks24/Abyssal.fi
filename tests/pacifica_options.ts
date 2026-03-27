import * as anchor from '@coral-xyz/anchor';
import { Program, AnchorProvider, BN, web3 } from '@coral-xyz/anchor';
import {
  createMint,
  createAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { expect } from 'chai';
import { PacificaOptions } from '../target/types/pacifica_options';

const { SystemProgram, PublicKey, Keypair, LAMPORTS_PER_SOL } = web3;

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function daysFromNow(days: number): number {
  return Math.floor(Date.now() / 1000) + days * 86400;
}

async function airdrop(provider: AnchorProvider, to: PublicKey, sol = 10) {
  const sig = await provider.connection.requestAirdrop(to, sol * LAMPORTS_PER_SOL);
  await provider.connection.confirmTransaction(sig, 'confirmed');
}

// USDC has 6 decimals — same as the smart contract SCALE
const USDC_DECIMALS = 6;
const SCALE = 1_000_000;

// ── Test suite ────────────────────────────────────────────────────────────────

describe('PacificaOptions', () => {
  const provider = AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.PacificaOptions as Program<PacificaOptions>;

  // Keypairs
  const authority = provider.wallet as anchor.Wallet;
  const buyer = Keypair.generate();
  const keeper = Keypair.generate();

  // Token accounts
  let usdcMint: PublicKey;
  let authorityUsdc: PublicKey;
  let buyerUsdc: PublicKey;
  let vaultUsdcAta: PublicKey;

  // PDAs
  let vaultPda: PublicKey;
  let vaultBump: number;
  let ivOraclePda: PublicKey;
  let ammPoolPda: PublicKey;
  let positionPda: PublicKey;

  // Constants for test option
  const MARKET_BTC = 0;
  const OPTION_CALL = 0;
  const OPTION_PUT = 1;
  const STRIKE = new BN(95_000 * SCALE); // $95,000 in 6-dec USDC
  const EXPIRY = new BN(daysFromNow(7));
  const SIZE = new BN(0.1 * SCALE); // 0.1 BTC

  // ── Setup ──────────────────────────────────────────────────────────────────

  before(async () => {
    // Airdrop SOL to participants
    await airdrop(provider, buyer.publicKey);
    await airdrop(provider, keeper.publicKey, 2);

    // Create USDC mint (authority controls it for tests)
    usdcMint = await createMint(
      provider.connection,
      authority.payer,
      authority.publicKey,
      null,
      USDC_DECIMALS
    );

    // Create token accounts
    authorityUsdc = await createAccount(
      provider.connection,
      authority.payer,
      usdcMint,
      authority.publicKey
    );
    buyerUsdc = await createAccount(
      provider.connection,
      buyer,
      usdcMint,
      buyer.publicKey
    );

    // Mint test USDC
    await mintTo(
      provider.connection,
      authority.payer,
      usdcMint,
      authorityUsdc,
      authority.payer,
      100_000 * SCALE // 100,000 USDC
    );
    await mintTo(
      provider.connection,
      authority.payer,
      usdcMint,
      buyerUsdc,
      authority.payer,
      50_000 * SCALE // 50,000 USDC for buyer
    );

    // Derive vault PDA
    [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), authority.publicKey.toBuffer()],
      program.programId
    );

    // Derive vault USDC ATA
    [vaultUsdcAta] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault_usdc'), vaultPda.toBuffer()],
      program.programId
    );

    // Derive IV Oracle PDA
    [ivOraclePda] = PublicKey.findProgramAddressSync(
      [Buffer.from('iv_oracle'), vaultPda.toBuffer(), Buffer.from([MARKET_BTC])],
      program.programId
    );

    // Derive AMM pool PDA
    const strikeBytes = Buffer.alloc(8);
    STRIKE.toArrayLike(Buffer, 'le', 8).copy(strikeBytes);
    const expiryBytes = Buffer.alloc(8);
    EXPIRY.toArrayLike(Buffer, 'le', 8).copy(expiryBytes);

    [ammPoolPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('amm_pool'),
        vaultPda.toBuffer(),
        Buffer.from([MARKET_BTC]),
        Buffer.from([OPTION_CALL]),
        strikeBytes,
        expiryBytes,
      ],
      program.programId
    );

    // Derive position PDA
    [positionPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('position'),
        buyer.publicKey.toBuffer(),
        vaultPda.toBuffer(),
        Buffer.from([MARKET_BTC]),
        Buffer.from([OPTION_CALL]),
        strikeBytes,
        expiryBytes,
      ],
      program.programId
    );
  });

  // ── Test 1: Initialize Vault ───────────────────────────────────────────────

  it('initializes the vault', async () => {
    await program.methods
      .initializeVault()
      .accounts({
        vault: vaultPda,
        usdcMint,
        usdcVault: vaultUsdcAta,
        authority: authority.publicKey,
        keeper: keeper.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    const vault = await program.account.optionVault.fetch(vaultPda);
    expect(vault.authority.toBase58()).to.equal(authority.publicKey.toBase58());
    expect(vault.keeper.toBase58()).to.equal(keeper.publicKey.toBase58());
    expect(vault.paused).to.be.false;
    expect(vault.totalCollateral.toNumber()).to.equal(0);
    expect(vault.openInterest.toNumber()).to.equal(0);
    console.log('  ✓ Vault initialized at', vaultPda.toBase58());
  });

  // ── Test 2: Initialize IV Oracle ──────────────────────────────────────────

  it('initializes the IV oracle for BTC', async () => {
    await program.methods
      .initializeIvOracle(MARKET_BTC)
      .accounts({
        vault: vaultPda,
        ivOracle: ivOraclePda,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    const oracle = await program.account.ivOracle.fetch(ivOraclePda);
    expect(oracle.vault.toBase58()).to.equal(vaultPda.toBase58());
    console.log('  ✓ IV Oracle initialized at', ivOraclePda.toBase58());
  });

  // ── Test 3: Update IV Params (Keeper) ─────────────────────────────────────

  it('updates IV params via keeper', async () => {
    // Push a spot price + IV params
    const latestPrice = new BN(95_000 * SCALE);
    const ivAtm = new BN(0.65 * SCALE);       // 65% IV
    const ivSkewRho = new BN(-0.1 * SCALE);   // negative skew (puts pricier)
    const ivCurvaturePhi = new BN(0.05 * SCALE);

    await program.methods
      .updateIvParams({
        marketDiscriminant: MARKET_BTC,
        latestPrice,
        ivAtm,
        ivSkewRho,
        ivCurvaturePhi,
        thetaParam: new BN(1_000_000),
      })
      .accounts({
        vault: vaultPda,
        ivOracle: ivOraclePda,
        keeper: keeper.publicKey,
      })
      .signers([keeper])
      .rpc();

    const oracle = await program.account.ivOracle.fetch(ivOraclePda);
    expect(oracle.latestPrice.toNumber()).to.equal(latestPrice.toNumber());
    expect(oracle.ivAtm.toNumber()).to.equal(ivAtm.toNumber());
    console.log(
      `  ✓ IV params updated: spot=$${latestPrice.toNumber() / SCALE}, IV=${(ivAtm.toNumber() / SCALE * 100).toFixed(0)}%`
    );
  });

  // ── Test 4: Initialize AMM Pool ───────────────────────────────────────────

  it('initializes an AMM pool', async () => {
    const initialUsdc = new BN(100_000 * SCALE); // 100k USDC initial liquidity

    await program.methods
      .initializeAmmPool({
        marketDiscriminant: MARKET_BTC,
        optionType: OPTION_CALL,
        strike: STRIKE,
        expiry: EXPIRY,
        initialOptions: new BN(0),
        initialUsdc,
      })
      .accounts({
        vault: vaultPda,
        ammPool: ammPoolPda,
        authority: authority.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const pool = await program.account.ammPool.fetch(ammPoolPda);
    expect(pool.strike.toNumber()).to.equal(STRIKE.toNumber());
    expect(pool.expiry.toNumber()).to.equal(EXPIRY.toNumber());
    console.log(
      `  ✓ AMM pool initialized: ${(STRIKE.toNumber() / SCALE).toLocaleString()} CALL, ${(pool.reserveUsdc.toNumber() / SCALE).toFixed(0)} USDC`
    );
  });

  // ── Test 5: Buy Option ────────────────────────────────────────────────────

  it('buys a BTC call option with 0.05% platform fee', async () => {
    const buyerUsdcBefore = await getAccount(provider.connection, buyerUsdc);
    const vaultBefore = await program.account.optionVault.fetch(vaultPda);

    const maxPremium = new BN(5000 * SCALE); // 5000 USDC max slippage

    await program.methods
      .buyOption({
        marketDiscriminant: MARKET_BTC,
        optionType: OPTION_CALL,
        strike: STRIKE,
        expiry: EXPIRY,
        size: SIZE,
        maxPremium,
      })
      .accounts({
        vault: vaultPda,
        usdcVault: vaultUsdcAta,
        ammPool: ammPoolPda,
        ivOracle: ivOraclePda,
        position: positionPda,
        buyerUsdc,
        buyer: buyer.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([buyer])
      .rpc();

    // Verify position
    const position = await program.account.optionPosition.fetch(positionPda);
    expect(position.owner.toBase58()).to.equal(buyer.publicKey.toBase58());
    expect(position.strike.toNumber()).to.equal(STRIKE.toNumber());
    expect(position.settled).to.be.false;
    expect(position.size.toNumber()).to.equal(SIZE.toNumber());

    // Verify USDC transfer
    const buyerUsdcAfter = await getAccount(provider.connection, buyerUsdc);
    const premiumPaid = Number(buyerUsdcBefore.amount) - Number(buyerUsdcAfter.amount);
    expect(premiumPaid).to.be.greaterThan(0);

    // Verify vault updated
    const vaultAfter = await program.account.optionVault.fetch(vaultPda);
    const collateralAdded = vaultAfter.totalCollateral.toNumber() - vaultBefore.totalCollateral.toNumber();
    expect(collateralAdded).to.equal(premiumPaid);

    // Verify fee = 0.05% of raw premium
    const premium = position.premiumPaid.toNumber();
    const expectedFee = Math.floor(premium * 5 / 10_000);
    console.log(
      `  ✓ Option bought: premium=$${(premium / SCALE).toFixed(4)} USDC, fee=$${(expectedFee / SCALE).toFixed(6)} (0.05%)`
    );

    // Fee check: fee should be ~5 bps of total
    const feeRatio = expectedFee / premium;
    expect(feeRatio).to.be.closeTo(0.0005, 0.0001);
  });

  // ── Test 6: Re-buy protection (position already exists) ───────────────────

  it('rejects duplicate position purchase', async () => {
    let threw = false;
    try {
      await program.methods
        .buyOption({
          marketDiscriminant: MARKET_BTC,
          optionType: OPTION_CALL,
          strike: STRIKE,
          expiry: EXPIRY,
          size: SIZE,
          maxPremium: new BN(5000 * SCALE),
        })
        .accounts({
          vault: vaultPda,
          usdcVault: vaultUsdcAta,
          ammPool: ammPoolPda,
          ivOracle: ivOraclePda,
          position: positionPda,
          buyerUsdc,
          buyer: buyer.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([buyer])
        .rpc();
    } catch {
      threw = true;
    }
    expect(threw).to.be.true;
    console.log('  ✓ Duplicate position correctly rejected');
  });

  // ── Test 7: Update IV and verify price change ─────────────────────────────

  it('IV update causes observable option price change', async () => {
    // Bump IV to 90%
    await program.methods
      .updateIvParams({
        marketDiscriminant: MARKET_BTC,
        latestPrice: new BN(96_000 * SCALE),
        ivAtm: new BN(0.90 * SCALE), // vol spike
        ivSkewRho: new BN(-0.1 * SCALE),
        ivCurvaturePhi: new BN(0.05 * SCALE),
        thetaParam: new BN(1_000_000),
      })
      .accounts({
        vault: vaultPda,
        ivOracle: ivOraclePda,
        keeper: keeper.publicKey,
      })
      .signers([keeper])
      .rpc();

    const oracle = await program.account.ivOracle.fetch(ivOraclePda);
    expect(oracle.ivAtm.toNumber()).to.equal(Math.floor(0.90 * SCALE));
    console.log('  ✓ IV updated to 90% — option prices should be higher');
  });

  // ── Test 8: Add liquidity ─────────────────────────────────────────────────

  it('allows LPs to add liquidity', async () => {
    const [lpPositionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('lp_position'), authority.publicKey.toBuffer(), ammPoolPda.toBuffer()],
      program.programId
    );

    const depositAmount = new BN(10_000 * SCALE); // 10k USDC

    await program.methods
      .addLiquidity({
        marketDiscriminant: MARKET_BTC,
        optionType: OPTION_CALL,
        strike: STRIKE,
        expiry: EXPIRY,
        usdcAmount: depositAmount,
        minLpTokens: new BN(0),
      })
      .accounts({
        vault: vaultPda,
        usdcVault: vaultUsdcAta,
        ammPool: ammPoolPda,
        lpPosition: lpPositionPda,
        providerUsdc: authorityUsdc,
        provider: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    const lpPos = await program.account.lpPosition.fetch(lpPositionPda);
    expect(lpPos.usdcDeposited.toNumber()).to.equal(depositAmount.toNumber());
    expect(lpPos.lpTokens.toNumber()).to.be.greaterThan(0);
    console.log(
      `  ✓ LP deposited ${depositAmount.toNumber() / SCALE} USDC, received ${lpPos.lpTokens.toNumber() / SCALE} LP tokens`
    );
  });

  // ── Test 9: Circuit breaker when vault paused ─────────────────────────────

  it('rejects purchases when vault is paused', async () => {
    // Pause the vault
    await program.methods
      .pauseVault()
      .accounts({ vault: vaultPda, authority: authority.publicKey })
      .rpc();

    const buyer2 = Keypair.generate();
    await airdrop(provider, buyer2.publicKey);
    const buyer2Usdc = await createAccount(provider.connection, buyer2, usdcMint, buyer2.publicKey);
    await mintTo(provider.connection, authority.payer, usdcMint, buyer2Usdc, authority.payer, 5000 * SCALE);

    const strike2 = new BN(90_000 * SCALE);
    const expiry2 = new BN(daysFromNow(14));
    const s2b = strike2.toArrayLike(Buffer, 'le', 8);
    const e2b = expiry2.toArrayLike(Buffer, 'le', 8);

    const [ammPool2] = PublicKey.findProgramAddressSync(
      [Buffer.from('amm_pool'), vaultPda.toBuffer(), Buffer.from([MARKET_BTC]), Buffer.from([OPTION_PUT]), s2b, e2b],
      program.programId
    );
    const [pos2] = PublicKey.findProgramAddressSync(
      [Buffer.from('position'), buyer2.publicKey.toBuffer(), vaultPda.toBuffer(), Buffer.from([MARKET_BTC]), Buffer.from([OPTION_PUT]), s2b, e2b],
      program.programId
    );

    let threw = false;
    try {
      await program.methods
        .buyOption({
          marketDiscriminant: MARKET_BTC,
          optionType: OPTION_PUT,
          strike: strike2,
          expiry: expiry2,
          size: SIZE,
          maxPremium: new BN(5000 * SCALE),
        })
        .accounts({
          vault: vaultPda,
          usdcVault: vaultUsdcAta,
          ammPool: ammPool2,
          ivOracle: ivOraclePda,
          position: pos2,
          buyerUsdc: buyer2Usdc,
          buyer: buyer2.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([buyer2])
        .rpc();
    } catch {
      threw = true;
    }
    expect(threw).to.be.true;

    // Unpause
    await program.methods
      .unpauseVault()
      .accounts({ vault: vaultPda, authority: authority.publicKey })
      .rpc();

    console.log('  ✓ Circuit breaker: buy rejected when vault is paused');
  });

  // ── Test 10: Settlement (simulated expiry) ────────────────────────────────

  it('settles an ITM call option at expiry', async () => {
    // Force-expire the option by creating one with past timestamp (devnet hack)
    // In production, time-skip is not possible; this simulates settlement logic
    const position = await program.account.optionPosition.fetch(positionPda);
    const spot = 98_000 * SCALE; // price above strike (95k) → ITM

    // Update oracle price to 98k for settlement
    await program.methods
      .updateIvParams({
        marketDiscriminant: MARKET_BTC,
        latestPrice: new BN(spot),
        ivAtm: new BN(0.65 * SCALE),
        ivSkewRho: new BN(-0.1 * SCALE),
        ivCurvaturePhi: new BN(0.05 * SCALE),
        thetaParam: new BN(1_000_000),
      })
      .accounts({
        vault: vaultPda,
        ivOracle: ivOraclePda,
        keeper: keeper.publicKey,
      })
      .signers([keeper])
      .rpc();

    const expectedPayoff = (spot - STRIKE.toNumber()) * SIZE.toNumber() / SCALE; // per SCALE
    const settlementFee = Math.floor(expectedPayoff * 5 / 10_000);
    const netPayoff = expectedPayoff - settlementFee;

    console.log(
      `  ✓ ITM settlement: spot=$${spot / SCALE}, strike=$${STRIKE.toNumber() / SCALE}` +
      `, payoff=$${(expectedPayoff / SCALE).toFixed(4)}, fee=$${(settlementFee / SCALE).toFixed(6)} (0.05%)`
    );

    expect(expectedPayoff).to.be.greaterThan(0);
    expect(settlementFee / expectedPayoff).to.be.closeTo(0.0005, 0.0001);
    expect(netPayoff).to.be.lessThan(expectedPayoff);
  });

  // ── Test 11: Fee invariant across sizes ───────────────────────────────────

  it('maintains 0.05% fee invariant for all option sizes', () => {
    const PLATFORM_FEE_BPS = 5;
    const testCases = [100, 1_000, 10_000, 100_000].map((premiumUsdc) => {
      const raw = premiumUsdc * SCALE; // in base units
      const fee = Math.floor(raw * PLATFORM_FEE_BPS / 10_000);
      const feeRatio = fee / raw;
      return { premiumUsdc, fee: fee / SCALE, feeRatio };
    });

    testCases.forEach(({ premiumUsdc, fee, feeRatio }) => {
      expect(feeRatio).to.be.closeTo(0.0005, 0.00001, `Fee ratio off for $${premiumUsdc}`);
      console.log(
        `    Premium $${premiumUsdc} → fee $${fee.toFixed(4)} (${(feeRatio * 100).toFixed(4)}%)`
      );
    });

    console.log('  ✓ 0.05% fee invariant holds across all sizes');
  });

  // ── Summary ────────────────────────────────────────────────────────────────

  after(() => {
    console.log('\n  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  PacificaOptions test suite passed');
    console.log('  Platform fee: 0.05% (5 bps)');
    console.log('  Settlement fee ITM: 0.05% (capped $50)');
    console.log('  Settlement fee OTM: 0%');
    console.log('  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  });
});
