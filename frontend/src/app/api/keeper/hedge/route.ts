/**
 * Pacifica hedge keeper — banded delta hedging via agent wallet.
 *
 * Env vars (two modes):
 *
 *   Agent wallet mode (preferred, more secure):
 *     PACIFICA_API_KEY       = Agent wallet private key (base58)
 *     PACIFICA_MAIN_ACCOUNT  = Main wallet pubkey (the account holding USDC)
 *
 *   Direct mode:
 *     PACIFICA_API_KEY       = Main wallet private key (base58)
 *     PACIFICA_MAIN_ACCOUNT  = (omitted — derived from signer)
 *
 * Triggered by Vercel Cron every 2 min.
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

// Rebalance band: ignore deltas under this fraction of notional
const HEDGE_BAND_PCT = 0.05; // 5%

function loadPacificaKeypair(): Keypair {
  const keyRaw = process.env.PACIFICA_API_KEY;
  if (!keyRaw) throw new Error('PACIFICA_API_KEY env var not set');
  // Strip whitespace and surrounding quotes that Vercel sometimes preserves
  const key = keyRaw.trim().replace(/^['"]|['"]$/g, '');
  // bs58 v6 is ESM — require() may return { default: {...} } on some builds
  const decode: (s: string) => Uint8Array =
    typeof bs58.decode === 'function'
      ? bs58.decode
      : bs58.default?.decode;
  // 1. Try base58 (Solana/Phantom export format)
  try {
    const bytes = decode(key);
    if (bytes.length === 64) return Keypair.fromSecretKey(bytes);
    if (bytes.length === 32) throw new Error(`PACIFICA_API_KEY is a 32-byte base58 string (looks like a pubkey, not a secret key — you need the 88-char EXPORT from Phantom)`);
    throw new Error(`PACIFICA_API_KEY base58 decoded to ${bytes.length} bytes, expected 64`);
  } catch (e: any) {
    // If decode itself failed, continue to JSON fallback
    if (!/decoded to|pubkey, not a secret/.test(e?.message ?? '')) {
      try {
        return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(key)));
      } catch {}
      throw new Error(`PACIFICA_API_KEY could not be parsed as base58 or JSON array (length=${key.length})`);
    }
    throw e;
  }
}

export async function GET(req: NextRequest) {
  // Vercel Cron auth
  const secret = req.nextUrl.searchParams.get('secret') ?? req.headers.get('authorization')?.replace('Bearer ', '');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const pacificaKp = loadPacificaKeypair();
    // Main account = wallet holding USDC on Pacifica (may differ from signer when using agent wallet)
    const pacificaAccount = process.env.PACIFICA_MAIN_ACCOUNT || pacificaKp.publicKey.toBase58();

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
      const base = process.env.PACIFICA_API_BASE_URL || 'https://api.pacifica.fi/api';
      const r = await fetch(`${base}/v1/kline/mark?symbol=${MARKET}&interval=1m&start_time=${Date.now() - 120000}&end_time=${Date.now()}&limit=1`);
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

    // Ensure leverage is x1 on this market — delta hedge requires 1-to-1 sizing
    // and any liquidation breaks the hedge. Idempotent / safe to call every tick.
    const leverageResult = await updateLeverage(pacificaKp, {
      symbol: MARKET,
      leverage: 1,
      mainAccount: pacificaAccount,
    });

    const side: 'bid' | 'ask' = delta_diff > 0 ? 'bid' : 'ask';
    const result = await placeMarketOrder(pacificaKp, {
      symbol: MARKET,
      side,
      amount: orderAmount.toFixed(4),
      slippagePercent: '5',
      reduceOnly,
      mainAccount: pacificaAccount,
    });

    return NextResponse.json({
      ...status,
      action: 'rebalance',
      order_side: side,
      order_amount: orderAmount,
      reduce_only: reduceOnly,
      leverage_set: leverageResult,
      result,
    });
  } catch (e: any) {
    console.error('[hedge]', e);
    return NextResponse.json({ error: e?.message ?? 'Hedge error' }, { status: 500 });
  }
}

export const POST = GET;
