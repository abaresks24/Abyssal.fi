'use client';

import { useEffect, useRef, useCallback } from 'react';
import { PublicKey, Connection, Transaction } from '@solana/web3.js';

/**
 * v2 faucet key — changing this resets all users so they get fauceted again.
 * Bump the version number to force a re-faucet for everyone.
 */
const FAUCET_DONE_KEY = 'abyssal_faucet_v2';

/** Filler wallet — skip auto-faucet (would send tokens to itself). */
const FILLER_ADDRESS = '58ZYLbE63N79tBrfSEUAyWY28muzAnV7MDjKt754tm4t';

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

/**
 * Calls the server-side faucet which sends SOL + 1000 USDP
 * directly from the filler wallet. No client signing needed.
 */
async function requestFaucet(wallet: string): Promise<{ signature: string; solAmount: number; usdpAmount: number }> {
  const res = await fetch('/api/faucet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Faucet failed');
  return data;
}

/**
 * Auto-faucet hook: on first wallet connection, the server sends
 * 0.05 SOL + 1000 USDP from the filler wallet.
 * Uses localStorage to avoid re-fauceting the same wallet.
 *
 * The sendTransaction param is kept for API compatibility but is no longer
 * used — all transfers happen server-side via the filler keypair.
 */
export function useAutoFaucet(
  address: string | null,
  publicKey: PublicKey | null,
  _sendTransaction: ((tx: Transaction, conn: Connection) => Promise<string>) | null,
) {
  const runningRef = useRef(false);

  const doFaucet = useCallback(async () => {
    if (!address) return;
    if (address === FILLER_ADDRESS) return;
    if (alreadyFauceted(address)) return;
    if (runningRef.current) return;
    runningRef.current = true;

    try {
      const result = await requestFaucet(address);
      markFauceted(address);
      console.log(`[AutoFaucet] Success: ${result.solAmount} SOL + ${result.usdpAmount} USDP sent to`, address);
    } catch (e) {
      console.warn('[AutoFaucet] Failed:', e);
      // Don't mark as fauceted on failure — retry on next connection
    } finally {
      runningRef.current = false;
    }
  }, [address]);

  useEffect(() => {
    if (address) {
      doFaucet();
    }
  }, [address, doFaucet]);
}
