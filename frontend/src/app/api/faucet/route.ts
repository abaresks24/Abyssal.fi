/**
 * Devnet USDC faucet — mints test USDC to a wallet.
 *
 * POST /api/faucet
 * Body: { wallet: string }   // base58 public key
 *
 * Requires env vars:
 *   AUTHORITY_KEYPAIR  — JSON array of the 64-byte authority secret key
 *                        (the account that has mint authority over USDC_MINT)
 *   NEXT_PUBLIC_SOLANA_RPC — Solana devnet RPC URL
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  Connection,
  Keypair,
  PublicKey,
} from '@solana/web3.js';
import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from '@solana/spl-token';

const SOLANA_RPC  = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const USDC_MINT   = process.env.NEXT_PUBLIC_USDC_MINT  ?? '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const FAUCET_AMOUNT = 1_000 * 1_000_000; // 1 000 USDC (6 decimals)

function loadAuthority(): Keypair {
  const raw = process.env.AUTHORITY_KEYPAIR;
  if (!raw) throw new Error('AUTHORITY_KEYPAIR env var not set');
  const parsed = JSON.parse(raw);
  return Keypair.fromSecretKey(Uint8Array.from(parsed));
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
    const authority  = loadAuthority();
    const mint       = new PublicKey(USDC_MINT);

    // Get or create the recipient's ATA
    const ata = await getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      mint,
      recipient,
    );

    // Mint FAUCET_AMOUNT to recipient
    const sig = await mintTo(
      connection,
      authority,
      mint,
      ata.address,
      authority, // mint authority
      FAUCET_AMOUNT,
    );

    return NextResponse.json({
      success: true,
      signature: sig,
      recipient: recipient.toBase58(),
      amount: FAUCET_AMOUNT / 1_000_000,
      ata: ata.address.toBase58(),
    });
  } catch (e: any) {
    console.error('[faucet]', e);
    return NextResponse.json(
      { error: e?.message ?? 'Faucet error' },
      { status: 500 },
    );
  }
}
