/**
 * Devnet USDC faucet — mints test USDC and tops up SOL for fees.
 *
 * POST /api/faucet
 * Body: { wallet: string }   // base58 public key
 *
 * Requires env vars:
 *   AUTHORITY_KEYPAIR      — JSON array (64 bytes) — mint authority on USDC_MINT.
 *                            Also used to refill the filler when its balance
 *                            drops below FILLER_REFILL_THRESHOLD.
 *   FILLER_KEYPAIR         — JSON array (64 bytes) — dedicated wallet that sends
 *                            SOL_FILL lamports to each claimant so they can pay
 *                            transaction fees. Generate with:
 *                              npx ts-node scripts/create_filler.ts
 *   NEXT_PUBLIC_SOLANA_RPC_URL — Solana devnet RPC URL
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from '@solana/spl-token';

const SOLANA_RPC    = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const USDC_MINT     = process.env.NEXT_PUBLIC_USDC_MINT ?? 'HC53kut48rC2raro2XkuzmQD1g4MA3XgDK1HtfCfXf6k';
const FAUCET_AMOUNT = 1_000 * 1_000_000; // 1 000 USDC (6 decimals)

// SOL sent to each claimant — enough for ~20 transactions
const SOL_FILL = Math.round(0.01 * LAMPORTS_PER_SOL);
// Refill the filler up to this amount when it runs low
const FILLER_REFILL_AMOUNT    = Math.round(1 * LAMPORTS_PER_SOL);
const FILLER_REFILL_THRESHOLD = Math.round(0.05 * LAMPORTS_PER_SOL);

function loadKeypair(envVar: string): Keypair {
  const raw = process.env[envVar];
  if (!raw) throw new Error(`${envVar} env var not set`);
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

async function solTransfer(
  connection: Connection,
  from: Keypair,
  to: PublicKey,
  lamports: number,
): Promise<string> {
  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: to, lamports }),
  );
  return sendAndConfirmTransaction(connection, tx, [from], { commitment: 'confirmed' });
}

/**
 * If the filler balance is below FILLER_REFILL_THRESHOLD, top it up from the
 * authority wallet. Fire-and-forget — does not block the faucet response.
 */
async function maybeRefillFiller(
  connection: Connection,
  filler: Keypair,
  authority: Keypair,
): Promise<void> {
  const balance = await connection.getBalance(filler.publicKey);
  if (balance >= FILLER_REFILL_THRESHOLD) return;

  const authBalance = await connection.getBalance(authority.publicKey);
  // Keep at least 0.1 SOL in authority for its own fees
  const available = authBalance - Math.round(0.1 * LAMPORTS_PER_SOL);
  if (available <= 0) return;

  const refillAmount = Math.min(FILLER_REFILL_AMOUNT, available);
  await solTransfer(connection, authority, filler.publicKey, refillAmount);
  console.log(`[faucet] filler refilled with ${refillAmount / LAMPORTS_PER_SOL} SOL`);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const walletStr: string = body?.wallet;
    if (!walletStr) {
      return NextResponse.json({ error: 'Missing wallet' }, { status: 400 });
    }

    let recipient: PublicKey;
    try {
      recipient = new PublicKey(walletStr);
    } catch {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
    }

    const connection = new Connection(SOLANA_RPC, 'confirmed');
    const authority  = loadKeypair('AUTHORITY_KEYPAIR');
    const filler     = loadKeypair('FILLER_KEYPAIR');
    const mint       = new PublicKey(USDC_MINT);

    // ── 1. Mint USDC ─────────────────────────────────────────────────────────
    const ata = await getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      mint,
      recipient,
    );

    const usdcSig = await mintTo(
      connection,
      authority,
      mint,
      ata.address,
      authority,
      FAUCET_AMOUNT,
    );

    // ── 2. Fill SOL for fees (filler → recipient) ─────────────────────────────
    const fillerBalance = await connection.getBalance(filler.publicKey);
    if (fillerBalance < SOL_FILL + 5_000) {
      throw new Error('Filler balance too low — contact admin');
    }

    const solSig = await solTransfer(connection, filler, recipient, SOL_FILL);

    // ── 3. Refill filler from authority if running low (async, non-blocking) ──
    maybeRefillFiller(connection, filler, authority).catch((err) =>
      console.error('[faucet] filler refill failed:', err),
    );

    return NextResponse.json({
      success:      true,
      signature:    usdcSig,
      solSignature: solSig,
      recipient:    recipient.toBase58(),
      usdcAmount:   FAUCET_AMOUNT / 1_000_000,
      solAmount:    SOL_FILL / LAMPORTS_PER_SOL,
      ata:          ata.address.toBase58(),
    });
  } catch (e: any) {
    console.error('[faucet]', e);
    return NextResponse.json(
      { error: e?.message ?? 'Faucet error' },
      { status: 500 },
    );
  }
}
