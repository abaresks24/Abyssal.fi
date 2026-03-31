'use client';
import { useState, useEffect } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program, BN } from '@coral-xyz/anchor';
import { SOLANA_RPC, VAULT_AUTHORITY, SCALE } from '@/lib/constants';
import { findVaultPDA } from '@/lib/anchor_client';
import IDL from '@/lib/pacifica_options_idl.json';

export interface VaultStats {
  totalCollateral: number; // USDC
  openInterest:    number; // USDC
  deltaNet:        number; // signed delta units
  feesCollected:   number; // USDC
  paused:          boolean;
  loading:         boolean;
  error:           string | null;
}

const DEFAULT: VaultStats = {
  totalCollateral: 0,
  openInterest:    0,
  deltaNet:        0,
  feesCollected:   0,
  paused:          false,
  loading:         true,
  error:           null,
};

export function useVaultStats(): VaultStats {
  const [stats, setStats] = useState<VaultStats>(DEFAULT);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const connection  = new Connection(SOLANA_RPC, 'confirmed');
        const authority   = new PublicKey(VAULT_AUTHORITY);
        const [vaultPDA]  = findVaultPDA(authority);

        const dummyWallet = {
          publicKey: authority,
          signTransaction:    async (tx: unknown) => tx,
          signAllTransactions: async (txs: unknown[]) => txs,
        };
        const provider = new AnchorProvider(connection, dummyWallet as never, { commitment: 'confirmed' });
        const program  = new Program(IDL as never, provider);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vault = await (program.account as any).optionVault.fetch(vaultPDA) as Record<string, BN | boolean>;

        if (!cancelled) {
          setStats({
            totalCollateral: (vault.totalCollateral as BN).toNumber() / SCALE,
            openInterest:    (vault.openInterest    as BN).toNumber() / SCALE,
            deltaNet:        (vault.deltaNet        as BN).toNumber() / SCALE,
            feesCollected:   (vault.feesCollected   as BN).toNumber() / SCALE,
            paused:          vault.paused as boolean,
            loading:         false,
            error:           null,
          });
        }
      } catch (e) {
        if (!cancelled) setStats(s => ({ ...s, loading: false, error: String(e) }));
      }
    }

    load();
    const id = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return stats;
}
