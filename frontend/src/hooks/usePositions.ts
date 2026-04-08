'use client';
import { useState, useEffect, useCallback } from 'react';
import { PublicKey } from '@solana/web3.js';
import { PacificaOptionsClient } from '@/lib/anchor_client';
import type { OptionPositionAccount } from '@/types';

export function usePositions(owner: PublicKey | null) {
  const [positions, setPositions] = useState<OptionPositionAccount[]>([]);
  const [loading, setLoading]     = useState(false);

  const ownerStr = owner?.toBase58() ?? null;

  const refetch = useCallback(async () => {
    if (!ownerStr) { setPositions([]); return; }
    setLoading(true);
    try {
      const result = await PacificaOptionsClient.getPositions(new PublicKey(ownerStr));
      setPositions(result);
    } catch {
      setPositions([]);
    } finally {
      setLoading(false);
    }
  }, [ownerStr]);

  useEffect(() => { refetch(); }, [refetch]);

  return { positions, loading, refetch };
}
