'use client';
import { useEffect, useState } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import IDL from '@/lib/pacifica_options_idl.json';
import { PROGRAM_ID, SOLANA_RPC, SCALE } from '@/lib/constants';

export interface TraderStats {
  owner: string;
  trades: number;
  wins: number;
  volume: number;     // total USDC notional in premiums
  pnl: number;        // payoff_received - premium_paid, across all positions
  winRate: number;    // wins / settled count
}

export interface LeaderboardData {
  traders: TraderStats[];
  totalVolume: number;
  totalTrades: number;
  uniqueTraders: number;
  avgWinRate: number | null;
}

export function useLeaderboard() {
  const [data, setData]       = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const conn = new Connection(SOLANA_RPC, 'confirmed');
        const dummy = { publicKey: PublicKey.default, signTransaction: async (t: any) => t, signAllTransactions: async (t: any[]) => t };
        const provider = new AnchorProvider(conn, dummy as any, { commitment: 'confirmed' });
        const program = new Program(IDL as any, provider);

        // Fetch ALL OptionPosition accounts
        const all = await (program.account as any).optionPosition.all();
        const byOwner = new Map<string, TraderStats>();
        let totalVolume = 0;
        let totalTrades = 0;

        for (const { account } of all) {
          const a: any = account;
          const premium = (a.premiumPaid as BN).toNumber() / SCALE;
          const payoff  = (a.payoffReceived as BN).toNumber() / SCALE;
          const size    = (a.size as BN).toNumber();
          const settled = !!a.settled;
          // Skip orphan PDAs (never filled)
          if (premium === 0 && size === 0) continue;

          const ownerStr = (a.owner as PublicKey).toBase58();
          const s = byOwner.get(ownerStr) ?? {
            owner: ownerStr, trades: 0, wins: 0, volume: 0, pnl: 0, winRate: 0,
          };
          s.trades  += 1;
          s.volume  += premium;
          s.pnl     += payoff - premium;
          if (settled && payoff > premium) s.wins += 1;
          byOwner.set(ownerStr, s);

          totalVolume += premium;
          totalTrades += 1;
        }

        const traders = Array.from(byOwner.values()).map(t => ({
          ...t,
          winRate: t.trades > 0 ? t.wins / t.trades : 0,
        })).sort((a, b) => b.pnl - a.pnl);

        const settledTraders = traders.filter(t => t.trades > 0);
        const avgWinRate = settledTraders.length > 0
          ? settledTraders.reduce((s, t) => s + t.winRate, 0) / settledTraders.length
          : null;

        if (!cancelled) {
          setData({
            traders,
            totalVolume,
            totalTrades,
            uniqueTraders: byOwner.size,
            avgWinRate,
          });
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Failed to load leaderboard');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { data, loading, error };
}
