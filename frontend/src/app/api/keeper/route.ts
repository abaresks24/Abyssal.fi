/**
 * Keeper endpoint — updates IV oracle prices from Pacifica API.
 * Called before each trade to ensure the price feed is fresh (< 60s).
 *
 * POST /api/keeper
 * Body: { market: "BTC" | "ETH" | "SOL" | ... }
 *
 * Uses KEEPER_KEYPAIR env var (vault_authority.json / 6rCfb...).
 */
import { NextRequest, NextResponse } from 'next/server';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import IDL from '@/lib/pacifica_options_idl.json';

const SOLANA_RPC  = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID  = new PublicKey('CBkvR8SeN6j8RQKB7dSxG3dza2v71XHmWEe8LgfMW1hG');
const VAULT_AUTH  = new PublicKey('AHWUeGsXbx9gd46SBS5SQK4rfQ8rGb1wWAzvZtJ6zdRg');
const SCALE       = 1_000_000;

const PACIFICA_API = process.env.NEXT_PUBLIC_PACIFICA_API_URL || 'https://api.pacifica.fi/api';

const MARKET_DISC: Record<string, number> = {
  BTC: 0, ETH: 1, SOL: 2,
  NVDA: 3, TSLA: 4, PLTR: 5, CRCL: 6, HOOD: 7, SP500: 8,
  XAU: 9, XAG: 10, PAXG: 11, PLATINUM: 12, NATGAS: 13, COPPER: 14,
};

const DEFAULT_IV: Record<string, number> = {
  BTC: 0.55, ETH: 0.60, SOL: 0.70,
  NVDA: 0.45, TSLA: 0.55, PLTR: 0.60, CRCL: 0.50, HOOD: 0.55, SP500: 0.20,
  XAU: 0.15, XAG: 0.25, PAXG: 0.15, PLATINUM: 0.20, NATGAS: 0.40, COPPER: 0.25,
};

// Cache: avoid spamming Pacifica + Solana on rapid retries
const priceCache: Record<string, { price: number; ts: number }> = {};
const CACHE_TTL = 30_000; // 30s

/** Fetch price from Pacifica REST API (mark price from latest 1m kline) */
async function fetchPacificaPrice(market: string): Promise<number> {
  const cached = priceCache[market];
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.price;

  const now = Date.now();
  const url = `${PACIFICA_API}/v1/kline/mark?symbol=${market}&interval=1m&start_time=${now - 120_000}&end_time=${now}&limit=1`;

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Pacifica ${res.status}`);

  const json = await res.json();
  if (!json.success || !Array.isArray(json.data) || json.data.length === 0) {
    throw new Error('No kline data from Pacifica');
  }

  const price = parseFloat(json.data[json.data.length - 1].c);
  if (!price || price <= 0) throw new Error('Invalid price from Pacifica');

  priceCache[market] = { price, ts: Date.now() };
  return price;
}

function loadKeypair(envVar: string): Keypair {
  const raw = process.env[envVar];
  if (!raw) throw new Error(`${envVar} env var not set`);
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const market: string = body?.market?.toUpperCase?.() ?? 'BTC';
    const disc = MARKET_DISC[market];
    if (disc === undefined) {
      return NextResponse.json({ error: `Unknown market: ${market}` }, { status: 400 });
    }

    const keeper = loadKeypair('KEEPER_KEYPAIR');
    const connection = new Connection(SOLANA_RPC, 'confirmed');

    // Fetch price from Pacifica
    let price: number;
    let priceSource = 'pacifica';
    try {
      price = await fetchPacificaPrice(market);
    } catch (e: any) {
      return NextResponse.json({
        error: `Pacifica price fetch failed for ${market}: ${e.message}`,
      }, { status: 502 });
    }

    const iv = DEFAULT_IV[market] ?? 0.50;

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
    const [oracle] = PublicKey.findProgramAddressSync(
      [Buffer.from('iv_oracle'), vault.toBuffer(), Buffer.from([disc])], PROGRAM_ID,
    );

    const sig = await program.methods
      .updateIvParams({
        marketDiscriminant: disc,
        ivAtm: new BN(Math.round(iv * SCALE)),
        ivSkewRho: new BN(-50000),
        ivCurvaturePhi: new BN(100000),
        thetaParam: new BN(SCALE),
        latestPrice: new BN(Math.round(price * SCALE)),
      })
      .accounts({
        vault,
        ivOracle: oracle,
        keeper: keeper.publicKey,
      } as any)
      .rpc();

    return NextResponse.json({
      success: true,
      market,
      price,
      priceSource,
      iv,
      signature: sig,
    });
  } catch (e: any) {
    console.error('[keeper]', e);
    return NextResponse.json({ error: e?.message ?? 'Keeper error' }, { status: 500 });
  }
}
