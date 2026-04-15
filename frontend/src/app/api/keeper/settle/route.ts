/**
 * Auto-settle keeper — processes all expired, unsettled option positions.
 *
 * GET /api/keeper/settle  (triggered by Vercel Cron)
 *
 * For each expired position:
 *   1. Fetch fresh oracle price from Pacifica
 *   2. Update on-chain oracle (update_iv_params)
 *   3. Call settle_expired with the settlement price
 *   4. On-chain: ITM → pay holder in USDP, burn NFT; OTM → just mark settled
 *   5. vault.open_interest decrements automatically
 *
 * Protected by CRON_SECRET env var (Vercel Cron adds it automatically).
 */
import { NextRequest, NextResponse } from 'next/server';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import IDL from '@/lib/pacifica_options_idl.json';

const SOLANA_RPC  = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID  = new PublicKey('CBkvR8SeN6j8RQKB7dSxG3dza2v71XHmWEe8LgfMW1hG');
const VAULT_AUTH  = new PublicKey('AHWUeGsXbx9gd46SBS5SQK4rfQ8rGb1wWAzvZtJ6zdRg');
const USDP_MINT   = new PublicKey('USDPqRbLidFGufty2s3oizmDEKdqx7ePTqzDMbf5ZKM');
const SCALE       = 1_000_000;

const MARKET_DISC: Record<string, number> = {
  BTC: 0, ETH: 1, SOL: 2,
  NVDA: 3, TSLA: 4, PLTR: 5, CRCL: 6, HOOD: 7, SP500: 8,
  XAU: 9, XAG: 10, PAXG: 11, PLATINUM: 12, NATGAS: 13, COPPER: 14,
};
const MARKET_FROM_ANCHOR: Record<string, string> = {
  btc: 'BTC', eth: 'ETH', sol: 'SOL',
  nvda: 'NVDA', tsla: 'TSLA', pltr: 'PLTR', crcl: 'CRCL', hood: 'HOOD', sp500: 'SP500',
  xau: 'XAU', xag: 'XAG', paxg: 'PAXG', platinum: 'PLATINUM', natgas: 'NATGAS', copper: 'COPPER',
};

const FALLBACK_PRICES: Record<string, number> = {
  BTC: 75000, ETH: 2400, SOL: 87,
  NVDA: 105, TSLA: 245, PLTR: 24, CRCL: 32, HOOD: 22, SP500: 5200,
  XAU: 2350, XAG: 28, PAXG: 2350, PLATINUM: 950, NATGAS: 3.5, COPPER: 4.2,
};

async function fetchPacificaPrice(market: string): Promise<number> {
  try {
    const now = Date.now();
    const url = `https://api.pacifica.fi/api/v1/kline/mark?symbol=${market}&interval=1m&start_time=${now - 120_000}&end_time=${now}&limit=1`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('fetch failed');
    const json = await res.json();
    const price = parseFloat(json.data?.[json.data.length - 1]?.c ?? '0');
    if (price > 0) return price;
  } catch {}
  return FALLBACK_PRICES[market] ?? 0;
}

function loadKeypair(envVar: string): Keypair {
  const raw = process.env[envVar];
  if (!raw) throw new Error(`${envVar} env var not set`);
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

export async function GET(req: NextRequest) {
  // Protect from unauthenticated triggers
  const secret = req.nextUrl.searchParams.get('secret') ?? req.headers.get('authorization')?.replace('Bearer ', '');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const keeper = loadKeypair('KEEPER_KEYPAIR');
    const connection = new Connection(SOLANA_RPC, 'confirmed');

    const wallet = {
      publicKey: keeper.publicKey,
      signTransaction: async (tx: any) => { tx.sign(keeper); return tx; },
      signAllTransactions: async (txs: any[]) => { txs.forEach(tx => tx.sign(keeper)); return txs; },
    };
    const provider = new AnchorProvider(connection, wallet as any, { commitment: 'confirmed' });
    const program = new Program(IDL as any, provider);

    const [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), VAULT_AUTH.toBuffer()], PROGRAM_ID,
    );
    const [usdcVault] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault_usdc'), vault.toBuffer()], PROGRAM_ID,
    );

    // Fetch all open (not settled) positions
    const allAccounts = await (program.account as any).optionPosition.all();
    const now = Math.floor(Date.now() / 1000);
    const toSettle = allAccounts.filter((a: any) => {
      const s = a.account;
      return !s.settled && s.size.toNumber() > 0 && s.expiry.toNumber() <= now;
    });

    const results: any[] = [];
    // Cache prices per market to avoid redundant fetches
    const priceCache: Record<string, number> = {};

    for (const { publicKey: posPk, account } of toSettle) {
      const a: any = account;
      const marketKey = Object.keys(a.market)[0];
      const market = MARKET_FROM_ANCHOR[marketKey];
      const optType = Object.keys(a.optionType)[0];
      const marketDisc = MARKET_DISC[market];
      const optTypeDisc = optType === 'call' ? 0 : 1;

      // Get price
      if (!priceCache[market]) {
        priceCache[market] = await fetchPacificaPrice(market);
      }
      const price = priceCache[market];
      if (!price || price <= 0) {
        results.push({ pos: posPk.toBase58(), skipped: 'no price' });
        continue;
      }

      // Update oracle first (required to be fresh on-chain)
      const [oracle] = PublicKey.findProgramAddressSync(
        [Buffer.from('iv_oracle'), vault.toBuffer(), Buffer.from([marketDisc])], PROGRAM_ID,
      );

      try {
        await program.methods
          .updateIvParams({
            marketDiscriminant: marketDisc,
            ivAtm: new BN(550_000),
            ivSkewRho: new BN(-50_000),
            ivCurvaturePhi: new BN(100_000),
            thetaParam: new BN(SCALE),
            latestPrice: new BN(Math.round(price * SCALE)),
          })
          .accounts({
            vault,
            ivOracle: oracle,
            keeper: keeper.publicKey,
          } as any)
          .rpc();
      } catch (e: any) {
        // Non-fatal if oracle update fails; try settlement anyway
      }

      // Find current NFT holder (may differ from position.owner after resale)
      const [nftMint] = PublicKey.findProgramAddressSync(
        [Buffer.from('option_nft'), posPk.toBuffer()], PROGRAM_ID,
      );
      let nftHolder: PublicKey = a.owner as PublicKey; // fallback
      try {
        const largest = await connection.getTokenLargestAccounts(nftMint);
        const owner1 = largest.value.find(x => x.uiAmount === 1);
        if (owner1) {
          const info = await connection.getParsedAccountInfo(owner1.address);
          const parsed: any = (info.value?.data as any)?.parsed;
          if (parsed?.info?.owner) nftHolder = new PublicKey(parsed.info.owner);
        }
      } catch {}

      const holderNftAta = await getAssociatedTokenAddress(nftMint, nftHolder);
      const holderUsdc   = await getAssociatedTokenAddress(USDP_MINT, nftHolder);

      try {
        const sig = await program.methods
          .settleExpired({
            marketDiscriminant: marketDisc,
            optionType: optTypeDisc,
            strike: a.strike,
            expiry: a.expiry,
            settlementPrice: new BN(Math.round(price * SCALE)),
          })
          .accounts({
            vault,
            usdcVault,
            ivOracle: oracle,
            holder: a.owner,           // original position owner (PDA seed)
            position: posPk,
            nftHolder,                 // current NFT holder — receives payoff
            holderUsdc,
            nftMint,
            holderNftAta,
            keeper: keeper.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          } as any)
          .rpc();

        results.push({
          pos: posPk.toBase58().slice(0, 12),
          market, optType, strike: a.strike.toNumber() / SCALE,
          price, settled: true, sig: sig.slice(0, 20),
        });
      } catch (e: any) {
        results.push({
          pos: posPk.toBase58().slice(0, 12),
          error: e?.message?.substring(0, 120) ?? 'unknown',
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed: toSettle.length,
      results,
    });
  } catch (e: any) {
    console.error('[settle]', e);
    return NextResponse.json({ error: e?.message ?? 'Settle error' }, { status: 500 });
  }
}

// Also allow POST for manual triggers
export const POST = GET;
