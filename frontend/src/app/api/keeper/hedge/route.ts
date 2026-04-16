/**
 * Pacifica hedge keeper — multi-market banded delta hedging via agent wallet.
 *
 * Aggregates delta per market from all open OptionPosition accounts on-chain,
 * then rebalances each hedgeable symbol on Pacifica independently.
 *
 * Env vars:
 *   PACIFICA_API_KEY       = agent / main wallet private key (base58 or JSON)
 *   PACIFICA_MAIN_ACCOUNT  = main wallet pubkey (optional — defaults to signer)
 */
import { NextRequest, NextResponse } from 'next/server';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const bs58 = require('bs58');
import IDL from '@/lib/pacifica_options_idl.json';
import { placeMarketOrder, getPositions, getAccountInfo, updateLeverage } from '@/lib/pacificaSign';

const SOLANA_RPC  = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID  = new PublicKey('CBkvR8SeN6j8RQKB7dSxG3dza2v71XHmWEe8LgfMW1hG');
const VAULT_AUTH  = new PublicKey('AHWUeGsXbx9gd46SBS5SQK4rfQ8rGb1wWAzvZtJ6zdRg');
const SCALE       = 1_000_000;
const HEDGE_BAND_PCT = 0.05; // 5% of collateral per market

// Pacifica symbol ←→ Abyssal on-chain market-enum mapping.
// Only include symbols actually perp-tradable on Pacifica.
// (Equities, PLAT/NATGAS/COPPER have no Pacifica perp yet — options still trade
// but aren't hedged. Once Pacifica lists them, just add here.)
const HEDGEABLE: Record<string, string> = {
  btc:  'BTC',
  eth:  'ETH',
  sol:  'SOL',
  paxg: 'PAXG', // maps Abyssal XAU-equivalent to Pacifica's PAXG perp
};

function loadPacificaKeypair(): Keypair {
  const keyRaw = process.env.PACIFICA_API_KEY;
  if (!keyRaw) throw new Error('PACIFICA_API_KEY env var not set');
  const key = keyRaw.trim().replace(/^['"]|['"]$/g, '');
  const decode: (s: string) => Uint8Array =
    typeof bs58.decode === 'function' ? bs58.decode : bs58.default?.decode;
  try {
    const bytes = decode(key);
    if (bytes.length === 64) return Keypair.fromSecretKey(bytes);
    if (bytes.length === 32) throw new Error('PACIFICA_API_KEY looks like a pubkey, not a secret key');
    throw new Error(`PACIFICA_API_KEY decoded to ${bytes.length} bytes, expected 64`);
  } catch (e: any) {
    if (!/decoded to|pubkey, not/.test(e?.message ?? '')) {
      try { return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(key))); } catch {}
      throw new Error(`PACIFICA_API_KEY could not be parsed (length=${key.length})`);
    }
    throw e;
  }
}

async function fetchMarkPrice(symbol: string): Promise<number> {
  const base = process.env.PACIFICA_API_BASE_URL || 'https://api.pacifica.fi/api';
  try {
    const r = await fetch(`${base}/v1/kline/mark?symbol=${symbol}&interval=1m&start_time=${Date.now() - 120000}&end_time=${Date.now()}&limit=1`);
    const j = await r.json();
    const p = parseFloat(j.data?.[j.data.length - 1]?.c ?? '0');
    return p > 0 ? p : 0;
  } catch { return 0; }
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret') ?? req.headers.get('authorization')?.replace('Bearer ', '');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const pacificaKp = loadPacificaKeypair();
    const pacificaAccount = process.env.PACIFICA_MAIN_ACCOUNT || pacificaKp.publicKey.toBase58();

    const connection = new Connection(SOLANA_RPC, 'confirmed');
    const dummy = { publicKey: PublicKey.default, signTransaction: async (t: any) => t, signAllTransactions: async (t: any[]) => t };
    const provider = new AnchorProvider(connection, dummy as any, { commitment: 'confirmed' });
    const program = new Program(IDL as any, provider);
    const [vault] = PublicKey.findProgramAddressSync([Buffer.from('vault'), VAULT_AUTH.toBuffer()], PROGRAM_ID);
    const vaultState: any = await (program.account as any).optionVault.fetch(vault);
    const vaultCollateral = (vaultState.totalCollateral as BN).toNumber() / SCALE;

    // ── Aggregate delta per market from open positions ─────────────────────
    const allPositions = await (program.account as any).optionPosition.all();
    const deltaPerMarket: Record<string, number> = {};
    for (const { account } of allPositions) {
      const a: any = account;
      if (a.settled) continue;
      const size = (a.size as BN).toNumber();
      if (size === 0) continue;
      const marketKey = Object.keys(a.market)[0]?.toLowerCase();
      if (!marketKey) continue;
      const entryDelta = (a.entryDelta as BN).toNumber();
      const isCall = a.optionType?.call !== undefined || a.optionType?.Call !== undefined;
      // User's delta = entryDelta × size (signed). Vault is opposite.
      const userDelta = (entryDelta * size) / SCALE / SCALE;
      const vaultDelta = -userDelta;
      // For puts entryDelta is already negative, for calls positive — no flip needed.
      deltaPerMarket[marketKey] = (deltaPerMarket[marketKey] ?? 0) + vaultDelta;
      void isCall; // kept for potential future logic
    }

    // ── Fetch Pacifica state ───────────────────────────────────────────────
    const [pacificaPositions, pacificaAccountInfo] = await Promise.all([
      getPositions(pacificaAccount),
      getAccountInfo(pacificaAccount),
    ]);
    const pacificaBalance = parseFloat(pacificaAccountInfo?.balance ?? '0');
    const pacificaAvailable = parseFloat(pacificaAccountInfo?.available_to_spend ?? '0');

    // ── Per-market rebalance ───────────────────────────────────────────────
    const perMarket: any[] = [];
    const orders: any[] = [];

    for (const [abyssalMarket, pacificaSymbol] of Object.entries(HEDGEABLE)) {
      const vaultDeltaUnits = deltaPerMarket[abyssalMarket] ?? 0;
      // Vault long delta → SHORT Pacifica. Vault short delta → LONG Pacifica.
      const targetHedgeAmount = -vaultDeltaUnits;
      const absTarget = Math.abs(targetHedgeAmount);

      const pos = pacificaPositions.find((p: any) => p.symbol === pacificaSymbol);
      const currentAmount = pos ? parseFloat(pos.amount) : 0;
      const currentSigned = pos?.side === 'bid' ? currentAmount : -currentAmount;
      const targetSigned = targetHedgeAmount;
      const delta_diff = targetSigned - currentSigned;

      const markPrice = await fetchMarkPrice(pacificaSymbol);
      const bandThreshold = markPrice > 0
        ? (vaultCollateral * HEDGE_BAND_PCT) / markPrice / Object.keys(HEDGEABLE).length
        : 0;
      const inBand = Math.abs(delta_diff) < bandThreshold || Math.abs(delta_diff) * markPrice < 10;

      const marketStatus: any = {
        symbol: pacificaSymbol,
        mark_price: markPrice,
        vault_delta_units: vaultDeltaUnits,
        target_hedge_amount: targetHedgeAmount,
        current_pacifica_amount: currentSigned,
        delta_diff,
        band_threshold: bandThreshold,
        in_band: inBand,
      };

      if (inBand) {
        perMarket.push({ ...marketStatus, action: 'none' });
        continue;
      }

      const orderAmount = Math.abs(delta_diff);
      const reduceOnly = currentSigned !== 0 && Math.sign(delta_diff) !== Math.sign(currentSigned);
      const side: 'bid' | 'ask' = delta_diff > 0 ? 'bid' : 'ask';

      try {
        await updateLeverage(pacificaKp, { symbol: pacificaSymbol, leverage: 1, mainAccount: pacificaAccount });
        const result = await placeMarketOrder(pacificaKp, {
          symbol: pacificaSymbol,
          side,
          amount: orderAmount.toFixed(4),
          slippagePercent: '5',
          reduceOnly,
          mainAccount: pacificaAccount,
        });
        orders.push({ symbol: pacificaSymbol, side, amount: orderAmount, result });
        perMarket.push({ ...marketStatus, action: 'rebalance', order_side: side, order_amount: orderAmount, reduce_only: reduceOnly, result });
      } catch (err: any) {
        perMarket.push({ ...marketStatus, action: 'error', error: err?.message ?? 'unknown' });
      }
    }

    return NextResponse.json({
      vault_collateral: vaultCollateral,
      pacifica_account: pacificaAccount,
      pacifica_balance: pacificaBalance,
      pacifica_available: pacificaAvailable,
      markets: perMarket,
      orders_placed: orders.length,
    });
  } catch (e: any) {
    console.error('[hedge]', e);
    return NextResponse.json({ error: e?.message ?? 'Hedge error' }, { status: 500 });
  }
}

export const POST = GET;
