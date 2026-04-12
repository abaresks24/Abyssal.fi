'use client';

import { useEffect, useRef, useCallback } from 'react';
import {
  PublicKey, Connection, Transaction, TransactionInstruction,
  SystemProgram, ComputeBudgetProgram,
} from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { SOLANA_RPC, PACIFICA_FAUCET_PROGRAM_ID } from '@/lib/constants';

const PACIFICA_PROGRAM_ID  = new PublicKey(PACIFICA_FAUCET_PROGRAM_ID);
const USDP_MINT_PK         = new PublicKey('USDPqRbLidFGufty2s3oizmDEKdqx7ePTqzDMbf5ZKM');
const TOKEN_PROGRAM_ID     = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOC_TOKEN_PROG_ID  = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const MINT_USDC_DISCRIMINATOR = Buffer.from([118, 144, 78, 118, 155, 214, 185, 186]);
const USDP_CLAIM_AMOUNT    = BigInt(1_000 * 1_000_000); // 1000 USDP (6 decimals)

const FAUCET_DONE_KEY = 'abyssal_faucet_done';

/** Returns true if this wallet has already been fauceted in this browser. */
function alreadyFauceted(address: string): boolean {
  try {
    const done = JSON.parse(localStorage.getItem(FAUCET_DONE_KEY) ?? '{}');
    return !!done[address];
  } catch { return false; }
}

function markFauceted(address: string) {
  try {
    const done = JSON.parse(localStorage.getItem(FAUCET_DONE_KEY) ?? '{}');
    done[address] = Date.now();
    localStorage.setItem(FAUCET_DONE_KEY, JSON.stringify(done));
  } catch {}
}

async function requestSolFaucet(wallet: string): Promise<string> {
  const res = await fetch('/api/faucet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Faucet failed');
  return data.signature as string;
}

async function claimUSDPFaucet(
  user: PublicKey,
  sendTransaction: (tx: Transaction, conn: Connection) => Promise<string>,
): Promise<string> {
  const connection = new Connection(SOLANA_RPC, 'confirmed');

  const [centralState] = PublicKey.findProgramAddressSync(
    [Buffer.from('central_state')],
    PACIFICA_PROGRAM_ID,
  );
  const [userAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from('user_account'), user.toBuffer()],
    PACIFICA_PROGRAM_ID,
  );
  const userUSDPATA = getAssociatedTokenAddressSync(USDP_MINT_PK, user, false);

  const amountBuf = Buffer.alloc(8);
  amountBuf.writeBigUInt64LE(USDP_CLAIM_AMOUNT);

  const ix = new TransactionInstruction({
    programId: PACIFICA_PROGRAM_ID,
    keys: [
      { pubkey: user,              isSigner: true,  isWritable: true  },
      { pubkey: userAccount,       isSigner: false, isWritable: true  },
      { pubkey: userUSDPATA,       isSigner: false, isWritable: true  },
      { pubkey: USDP_MINT_PK,      isSigner: false, isWritable: true  },
      { pubkey: centralState,      isSigner: false, isWritable: false },
      { pubkey: ASSOC_TOKEN_PROG_ID, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID,  isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([MINT_USDC_DISCRIMINATOR, amountBuf]),
  });

  const tx = new Transaction()
    .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }))
    .add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }))
    .add(ix);

  return sendTransaction(tx, connection);
}

/**
 * Auto-faucet hook: on first wallet connection, sends SOL + 1000 USDP.
 * Uses localStorage to avoid re-fauceting the same wallet.
 */
export function useAutoFaucet(
  address: string | null,
  publicKey: PublicKey | null,
  sendTransaction: ((tx: Transaction, conn: Connection) => Promise<string>) | null,
) {
  const runningRef = useRef(false);

  const doFaucet = useCallback(async () => {
    if (!address || !publicKey || !sendTransaction) return;
    if (alreadyFauceted(address)) return;
    if (runningRef.current) return;
    runningRef.current = true;

    try {
      // 1. Send SOL for fees
      await requestSolFaucet(address);

      // 2. Wait a bit for SOL to land
      await new Promise(r => setTimeout(r, 2000));

      // 3. Claim 1000 USDP
      await claimUSDPFaucet(publicKey, sendTransaction);

      // Mark as done
      markFauceted(address);
      console.log('[AutoFaucet] Success: 0.05 SOL + 1000 USDP sent to', address);
    } catch (e) {
      console.warn('[AutoFaucet] Failed (user may need to claim manually):', e);
      // Still mark as attempted to avoid infinite retry loops
      markFauceted(address);
    } finally {
      runningRef.current = false;
    }
  }, [address, publicKey, sendTransaction]);

  useEffect(() => {
    if (address && publicKey && sendTransaction) {
      doFaucet();
    }
  }, [address, publicKey, sendTransaction, doFaucet]);
}
