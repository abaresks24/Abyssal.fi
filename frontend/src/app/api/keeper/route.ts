/**
 * Keeper endpoint — updates IV oracle prices for a given market.
 * Called before each trade to ensure the price feed is fresh (< 60s).
 *
 * POST /api/keeper
 * Body: { market: "BTC" | "ETH" | "SOL" }
 *
 * Uses the KEEPER_KEYPAIR env var (same as vault_authority.json / 6rCfb...).
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  Connection, Keypair, PublicKey,
} from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import https from 'https';
import IDL from '@/lib/pacifica_options_idl.json';

const SOLANA_RPC  = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID  = new PublicKey('CBkvR8SeN6j8RQKB7dSxG3dza2v71XHmWEe8LgfMW1hG');
const VAULT_AUTH  = new PublicKey('AHWUeGsXbx9gd46SBS5SQK4rfQ8rGb1wWAzvZtJ6zdRg');
const SCALE       = 1_000_000;

const MARKET_DISC: Record<string, number> = {
  BTC: 0, ETH: 1, SOL: 2,
  NVDA: 3, TSLA: 4, PLTR: 5, CRCL: 6, HOOD: 7, SP500: 8,
  XAU: 9, XAG: 10, PAXG: 11, PLATINUM: 12, NATGAS: 13, COPPER: 14,
};

const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana',
};

const DEFAULT_IV: Record<string, number> = {
  BTC: 0.55, ETH: 0.60, SOL: 0.70,
};

// Simple mock prices for non-crypto markets
const MOCK_PRICES: Record<string, number> = {
  NVDA: 105, TSLA: 245, PLTR: 24, CRCL: 32, HOOD: 22, SP500: 5200,
  XAU: 2350, XAG: 28, PAXG: 2350, PLATINUM: 950, NATGAS: 3.5, COPPER: 4.2,
};

function fetchCoinGeckoPrice(id: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', (d) => data += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json[id]?.usd ?? 0);
        } catch { reject(new Error('CoinGecko parse error')); }
      });
    }).on('error', reject);
  });
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

    // Fetch price
    let price: number;
    const cgId = COINGECKO_IDS[market];
    if (cgId) {
      try {
        price = await fetchCoinGeckoPrice(cgId);
      } catch {
        price = MOCK_PRICES[market] ?? 0;
      }
    } else {
      price = MOCK_PRICES[market] ?? 0;
    }

    if (price <= 0) {
      return NextResponse.json({ error: 'Could not fetch price' }, { status: 500 });
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
      [Buffer.from('vault'), VAULT_AUTH.toBuffer()],
      PROGRAM_ID,
    );
    const [oracle] = PublicKey.findProgramAddressSync(
      [Buffer.from('iv_oracle'), vault.toBuffer(), Buffer.from([disc])],
      PROGRAM_ID,
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
      iv,
      signature: sig,
    });
  } catch (e: any) {
    console.error('[keeper]', e);
    return NextResponse.json({ error: e?.message ?? 'Keeper error' }, { status: 500 });
  }
}
