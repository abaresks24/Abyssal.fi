/**
 * Pacifica hedge keeper — banded delta hedging.
 *
 * GET/POST /api/keeper/hedge
 *
 * Flow:
 *   1. Read vault.delta_net from Anchor program (per market)
 *   2. Fetch current Pacifica perp position (if any)
 *   3. Compute target: hedge position should offset vault's net delta
 *      - If vault is delta-short (sold calls) → go LONG on Pacifica
 *      - If vault is delta-long (sold puts)  → go SHORT on Pacifica
 *   4. Apply band: only rebalance if |delta_diff| > threshold (5% of notional)
 *   5. Place market order on Pacifica via signed API
 *
 * Env vars:
 *   PACIFICA_API_KEY = Solana keypair base58 private key (the Pacifica account)
 *     This wallet must have USDC deposited on Pacifica for margin.
 *
 * Triggered by Vercel Cron every 2 min (see vercel.json).
 */
import { NextRequest, NextResponse } from 'next/server';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const bs58 = require('bs58');
import IDL from '@/lib/pacifica_options_idl.json';
import { placeMarketOrder, getPositions, getAccountInfo } from '@/lib/pacificaSign';

const SOLANA_RPC  = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID  = new PublicKey('CBkvR8SeN6j8RQKB7dSxG3dza2v71XHmWEe8LgfMW1hG');
const VAULT_AUTH  = new PublicKey('AHWUeGsXbx9gd46SBS5SQK4rfQ8rGb1wWAzvZtJ6zdRg');
const SCALE       = 1_000_000;

// Rebalance band: ignore deltas under this fraction of notional
const HEDGE_BAND_PCT = 0.05; // 5%

function loadPacificaKeypair(): Keypair {
  const key = process.env.PACIFICA_API_KEY;
  if (!key) throw new Error('PACIFICA_API_KEY env var not set');
  // Try base58 private key first (Solana format), fall back to JSON array
  try {
    const bytes = bs58.decode(key);
    if (bytes.length === 64) return Keypair.fromSecretKey(bytes);
  } catch {}
  try {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(key)));
  } catch {}
  throw new Error('PACIFICA_API_KEY must be base58 secret key or JSON array');
}

export async function GET(req: NextRequest) {
  // Vercel Cron auth
  const secret = req.nextUrl.searchParams.get('secret') ?? req.headers.get('authorization')?.replace('Bearer ', '');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const pacificaKp = loadPacificaKeypair();
    const pacificaAccount = pacificaKp.publicKey.toBase58();

    // 1. Read vault state from on-chain
    const connection = new Connection(SOLANA_RPC, 'confirmed');
    const dummy = { publicKey: PublicKey.default, signTransaction: async (t: any) => t, signAllTransactions: async (t: any[]) => t };
    const provider = new AnchorProvider(connection, dummy as any, { commitment: 'confirmed' });
    const program = new Program(IDL as any, provider);
    const [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), VAULT_AUTH.toBuffer()], PROGRAM_ID,
    );
    const vaultState: any = await (program.account as any).optionVault.fetch(vault);

    // 2. Net delta from vault (signed, scaled 1e6)
    // Positive = vault is net long delta → user sold puts → we need to SHORT on Pacifica
    // Negative = vault is net short delta → user bought calls → we need to LONG on Pacifica
    const vaultDeltaRaw = (vaultState.deltaNet as BN).toNumber();
    const vaultDeltaUnits = vaultDeltaRaw / SCALE; // in BTC-equivalent units (approximation)

    // 3. Fetch current Pacifica positions + account
    const [pacificaPositions, pacificaAccountInfo] = await Promise.all([
      getPositions(pacificaAccount),
      getAccountInfo(pacificaAccount),
    ]);

    const pacificaBalance = parseFloat(pacificaAccountInfo?.balance ?? '0');
    const pacificaAvailable = parseFloat(pacificaAccountInfo?.available_to_spend ?? '0');

    // Abyssal currently only hedges BTC (single-market MVP)
    const MARKET = 'BTC';
    // Get mark price from our keeper cache (oracle)
    let markPrice = 75000;
    try {
      const r = await fetch(`https://api.pacifica.fi/api/v1/kline/mark?symbol=${MARKET}&interval=1m&start_time=${Date.now() - 120000}&end_time=${Date.now()}&limit=1`);
      const j = await r.json();
      const p = parseFloat(j.data?.[j.data.length - 1]?.c ?? '0');
      if (p > 0) markPrice = p;
    } catch {}

    // 4. Compute hedge target
    // Vault short delta of X BTC → we should be long X BTC on Pacifica
    const targetHedgeAmount = -vaultDeltaUnits; // opposite of vault delta
    const targetSide: 'bid' | 'ask' = targetHedgeAmount >= 0 ? 'bid' : 'ask';
    const absTarget = Math.abs(targetHedgeAmount);

    // Current Pacifica position
    const btcPos = pacificaPositions.find(p => p.symbol === MARKET);
    const currentAmount = btcPos ? parseFloat(btcPos.amount) : 0;
    const currentSide = btcPos?.side ?? null;
    const currentSigned = currentSide === 'bid' ? currentAmount : -currentAmount;
    const targetSigned = targetSide === 'bid' ? absTarget : -absTarget;
    const delta_diff = targetSigned - currentSigned;

    // 5. Apply band — only rebalance if delta diff > 5% of notional
    const vaultCollateral = (vaultState.totalCollateral as BN).toNumber() / SCALE;
    const notionalThreshold = vaultCollateral * HEDGE_BAND_PCT / markPrice; // in BTC units
    const inBand = Math.abs(delta_diff) < notionalThreshold;

    const status: any = {
      market: MARKET,
      mark_price: markPrice,
      vault_delta_units: vaultDeltaUnits,
      vault_collateral: vaultCollateral,
      target_hedge_amount: targetHedgeAmount,
      current_pacifica_amount: currentSigned,
      delta_diff,
      band_threshold_btc: notionalThreshold,
      in_band: inBand,
      pacifica_balance: pacificaBalance,
      pacifica_available: pacificaAvailable,
      pacifica_account: pacificaAccount,
    };

    if (inBand) {
      return NextResponse.json({ ...status, action: 'none', reason: 'within band' });
    }

    // 6. Place rebalance order (at least $10 notional, avoid dust)
    const orderAmount = Math.abs(delta_diff);
    if (orderAmount * markPrice < 10) {
      return NextResponse.json({ ...status, action: 'none', reason: 'below dust threshold' });
    }

    // If increasing position in same direction → not reduce-only
    // If switching side or reducing → use reduce-only
    const reduceOnly = currentSigned !== 0 && Math.sign(delta_diff) !== Math.sign(currentSigned);

    const side: 'bid' | 'ask' = delta_diff > 0 ? 'bid' : 'ask';
    const result = await placeMarketOrder(pacificaKp, {
      symbol: MARKET,
      side,
      amount: orderAmount.toFixed(4),
      slippagePercent: '2',
      reduceOnly,
    });

    return NextResponse.json({
      ...status,
      action: 'rebalance',
      order_side: side,
      order_amount: orderAmount,
      reduce_only: reduceOnly,
      result,
    });
  } catch (e: any) {
    console.error('[hedge]', e);
    return NextResponse.json({ error: e?.message ?? 'Hedge error' }, { status: 500 });
  }
}

export const POST = GET;
