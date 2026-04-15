'use client';
import React, { useState } from 'react';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { createBurnInstruction, getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { useSignerWallet } from '@/hooks/useSignerWallet';
import { useEffectiveWallet } from '@/hooks/useEffectiveWallet';
import { VAULT_AUTHORITY, SOLANA_RPC } from '@/lib/constants';
import { findVaultPDA, findVlpMintPDA } from '@/lib/anchor_client';

export function BurnVlpButton({ onDone }: { onDone?: () => void }) {
  const { walletForClient } = useSignerWallet();
  const { publicKey } = useEffectiveWallet();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleBurn = async () => {
    if (!publicKey || !walletForClient) return;
    setLoading(true); setErr(null);
    try {
      const conn = new Connection(SOLANA_RPC, 'confirmed');
      const [vault] = findVaultPDA(new PublicKey(VAULT_AUTHORITY));
      const [vlpMint] = findVlpMintPDA(vault);
      const ata = await getAssociatedTokenAddress(vlpMint, publicKey);

      const bal = await conn.getTokenAccountBalance(ata);
      const amount = BigInt(bal.value.amount);
      if (amount === BigInt(0)) { setErr('No vLP to burn.'); return; }

      const tx = new Transaction().add(
        createBurnInstruction(ata, vlpMint, publicKey, amount, [], TOKEN_PROGRAM_ID)
      );
      tx.feePayer = publicKey;
      tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
      const signed = await walletForClient.signTransaction!(tx);
      try {
        const sig = await conn.sendRawTransaction(signed.serialize(), { skipPreflight: true });
        await conn.confirmTransaction(sig, 'confirmed');
      } catch (sendErr: any) {
        // "already processed" means the wallet RPC submitted it first — treat as success
        if (!/already (been )?processed/i.test(sendErr?.message ?? '')) throw sendErr;
      }
      onDone?.();
    } catch (e: any) {
      setErr(e?.message ?? 'Burn failed');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <button
        onClick={handleBurn}
        disabled={loading || !publicKey}
        style={{
          padding: '6px 12px', fontSize: 11, background: 'transparent',
          border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text3)',
          cursor: loading ? 'wait' : 'pointer',
        }}
      >
        {loading ? 'Burning…' : 'Burn orphan vLP'}
      </button>
      {err && <span style={{ fontSize: 10, color: 'var(--red)' }}>{err}</span>}
    </div>
  );
}
