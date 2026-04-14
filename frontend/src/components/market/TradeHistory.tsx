'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { PublicKey, Connection } from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import IDL from '@/lib/pacifica_options_idl.json';
import { SOLANA_RPC } from '@/lib/constants';
import type { Market, OptionType } from '@/types';

const PROGRAM_ID = new PublicKey('CBkvR8SeN6j8RQKB7dSxG3dza2v71XHmWEe8LgfMW1hG');
const SCALE = 1_000_000;

const MARKET_FROM_ANCHOR: Record<string, Market> = {
  btc: 'BTC', eth: 'ETH', sol: 'SOL',
  nvda: 'NVDA', tsla: 'TSLA', pltr: 'PLTR', crcl: 'CRCL', hood: 'HOOD', sp500: 'SP500',
  xau: 'XAU', xag: 'XAG', paxg: 'PAXG', platinum: 'PLATINUM', natgas: 'NATGAS', copper: 'COPPER',
};

interface Trade {
  pubkey: string;
  owner: string;
  market: Market;
  optionType: OptionType;
  strike: number;
  expiry: Date;
  size: number;
  premiumPaid: number;
  createdAt: Date;
}

function fmt(n: number, d = 2) {
  if (n >= 1000) return '$' + Math.round(n).toLocaleString();
  return '$' + n.toFixed(d);
}

function timeAgo(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  return Math.floor(s / 86400) + 'd';
}

export function TradeHistory() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTrades = useCallback(async () => {
    try {
      const conn = new Connection(SOLANA_RPC, 'confirmed');
      const dummy = { publicKey: PublicKey.default, signTransaction: async (t: any) => t, signAllTransactions: async (t: any[]) => t };
      const provider = new AnchorProvider(conn, dummy as any, { commitment: 'confirmed' });
      const program = new Program(IDL as any, provider);

      const accounts = await (program.account as any).optionPosition.all();

      const parsed: Trade[] = accounts
        .map(({ publicKey, account }: any) => {
          const a = account;
          const marketKey = Object.keys(a.market)[0];
          const optTypeKey = Object.keys(a.optionType)[0];
          return {
            pubkey: publicKey.toBase58(),
            owner: (a.owner as PublicKey).toBase58(),
            market: (MARKET_FROM_ANCHOR[marketKey] ?? 'BTC') as Market,
            optionType: (optTypeKey === 'call' ? 'Call' : 'Put') as OptionType,
            strike: (a.strike as BN).toNumber() / SCALE,
            expiry: new Date((a.expiry as BN).toNumber() * 1000),
            size: (a.size as BN).toNumber() / SCALE,
            premiumPaid: (a.premiumPaid as BN).toNumber() / SCALE,
            createdAt: new Date((a.createdAt as BN).toNumber() * 1000),
          };
        })
        // Only show positions with actual size (not empty ensureSeries shells)
        .filter((t: Trade) => t.size > 0 && t.premiumPaid > 0)
        .sort((a: Trade, b: Trade) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 50); // Last 50 trades

      setTrades(parsed);
    } catch (e) {
      console.warn('[TradeHistory]', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTrades();
    const id = setInterval(fetchTrades, 30_000); // Refresh every 30s
    return () => clearInterval(id);
  }, [fetchTrades]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '7px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: 11, letterSpacing: '0.02em' }}>Options Flow</span>
        <span style={{ color: 'var(--text3)', fontSize: 9 }}>{trades.length} trades</span>
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: '32px 36px 1fr 52px',
        padding: '4px 8px', fontSize: 9, color: 'var(--text3)',
        borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0,
        letterSpacing: '0.06em', textTransform: 'uppercase',
      }}>
        <span>Time</span><span>Side</span><span>Strike · Exp</span><span style={{ textAlign: 'right' }}>Prem</span>
      </div>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: 'var(--text3)', fontSize: 11 }}>Loading…</span>
        </div>
      ) : trades.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: 'var(--text3)', fontSize: 11 }}>No trades yet</span>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {trades.map(t => {
            const isCall = t.optionType === 'Call';
            const color = isCall ? 'var(--green)' : 'var(--red)';
            return (
              <div key={t.pubkey} style={{
                display: 'grid', gridTemplateColumns: '32px 36px 1fr 52px',
                padding: '3px 8px', fontSize: 11, fontFamily: 'monospace',
                borderBottom: '1px solid rgba(255,255,255,0.02)',
              }}>
                <span style={{ color: 'var(--text3)', fontSize: 9 }}>{timeAgo(t.createdAt)}</span>
                <span style={{ color, fontWeight: 700, fontSize: 10 }}>
                  {isCall ? '↗C' : '↘P'}
                </span>
                <span style={{ color: 'var(--text2)', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.market} ${Math.round(t.strike).toLocaleString()} · {t.expiry.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <span style={{ color: 'var(--cyan)', textAlign: 'right', fontSize: 10, fontWeight: 600 }}>
                  {fmt(t.premiumPaid)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
