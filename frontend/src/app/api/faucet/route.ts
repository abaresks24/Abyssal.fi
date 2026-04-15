/**
 * Devnet faucet — sends SOL (for fees) + USDP (for trading) to new users.
 *
 * The filler wallet must hold:
 *   - Enough SOL to cover transfers + rent
 *   - Enough USDP in its ATA to distribute
 *
 * POST /api/faucet
 * Body: { wallet: string }
 *
 * Requires env vars:
 *   FILLER_KEYPAIR  — JSON array (64 bytes) of the filler wallet secret key
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
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

const SOLANA_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';

// Pacifica USDP mint on devnet
const USDP_MINT = new PublicKey('USDPqRbLidFGufty2s3oizmDEKdqx7ePTqzDMbf5ZKM');

// SOL sent to each claimant — enough for ~20 transactions
const SOL_FILL = Math.round(0.05 * LAMPORTS_PER_SOL);

// USDP sent to each claimant — 1000 USDP (6 decimals)
const USDP_FILL = 1_000 * 1_000_000;

function loadKeypair(envVar: string): Keypair {
  const raw = process.env[envVar];
  if (!raw) throw new Error(`${envVar} env var not set`);
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
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

    // Check filler has enough SOL
    const fillerBalance = await connection.getBalance(filler.publicKey);
    if (fillerBalance < SOL_FILL + 20_000) {
      throw new Error('Filler SOL balance too low — contact admin');
    }

    // ── Guard: skip if recipient already has USDP ─────────────────────────────

    const fillerUsdpAta = await getAssociatedTokenAddress(USDP_MINT, filler.publicKey);
    const recipientUsdpAta = await getAssociatedTokenAddress(USDP_MINT, recipient);

    const recipientAtaInfo = await connection.getAccountInfo(recipientUsdpAta);
    if (recipientAtaInfo) {
      // ATA exists — check balance; skip if they already have USDP
      try {
        const bal = await connection.getTokenAccountBalance(recipientUsdpAta);
        const uiAmount = parseFloat(bal.value.uiAmountString ?? '0');
        if (uiAmount >= 100) {
          return NextResponse.json({
            success: true,
            signature: 'already_funded',
            recipient: recipient.toBase58(),
            solAmount: 0,
            usdpAmount: 0,
            message: `Wallet already has ${uiAmount} USDP — skipped`,
          });
        }
      } catch {}
    }

    // ── Build transaction: SOL transfer + USDP transfer ──────────────────────

    const tx = new Transaction();

    // 1. SOL transfer
    tx.add(
      SystemProgram.transfer({
        fromPubkey: filler.publicKey,
        toPubkey: recipient,
        lamports: SOL_FILL,
      }),
    );
    if (!recipientAtaInfo) {
      // Create ATA for recipient (filler pays rent)
      tx.add(
        createAssociatedTokenAccountInstruction(
          filler.publicKey,  // payer
          recipientUsdpAta,  // ATA address
          recipient,         // owner
          USDP_MINT,         // mint
        ),
      );
    }

    // Transfer USDP from filler to recipient
    tx.add(
      createTransferInstruction(
        fillerUsdpAta,      // source
        recipientUsdpAta,   // destination
        filler.publicKey,   // authority
        USDP_FILL,          // amount (raw, 6 decimals)
        [],                 // multiSigners
        TOKEN_PROGRAM_ID,
      ),
    );

    const sig = await sendAndConfirmTransaction(connection, tx, [filler], {
      commitment: 'confirmed',
    });

    return NextResponse.json({
      success:    true,
      signature:  sig,
      recipient:  recipient.toBase58(),
      solAmount:  SOL_FILL / LAMPORTS_PER_SOL,
      usdpAmount: USDP_FILL / 1_000_000,
    });
  } catch (e: any) {
    console.error('[faucet]', e);
    return NextResponse.json({ error: e?.message ?? 'Faucet error' }, { status: 500 });
  }
}
