/**
 * Devnet faucet — sends SOL for transaction fees.
 *
 * USDP (Pacifica's stablecoin) is distributed by Pacifica's own faucet:
 *   https://app.pacifica.fi/faucet
 *
 * POST /api/faucet
 * Body: { wallet: string }
 *
 * Requires env vars:
 *   FILLER_KEYPAIR  — JSON array (64 bytes) — wallet that sends SOL_FILL lamports
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

const SOLANA_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';

// SOL sent to each claimant — enough for ~20 transactions
const SOL_FILL = Math.round(0.05 * LAMPORTS_PER_SOL);

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
    const filler = loadKeypair('FILLER_KEYPAIR');

    const fillerBalance = await connection.getBalance(filler.publicKey);
    if (fillerBalance < SOL_FILL + 5_000) {
      throw new Error('Filler balance too low — contact admin');
    }

    const solSig = await solTransfer(connection, filler, recipient, SOL_FILL);

    return NextResponse.json({
      success:     true,
      signature:   solSig,
      recipient:   recipient.toBase58(),
      solAmount:   SOL_FILL / LAMPORTS_PER_SOL,
    });
  } catch (e: any) {
    console.error('[faucet]', e);
    return NextResponse.json({ error: e?.message ?? 'Faucet error' }, { status: 500 });
  }
}
