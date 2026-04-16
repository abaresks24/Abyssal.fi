'use client';
import React from 'react';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useLeaderboard } from '@/hooks/useLeaderboard';
import { solscanAccount } from '@/lib/constants';

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function Leaderboard() {
  const { isMobile } = useBreakpoint();
  const { data, loading, error } = useLeaderboard();
  const pad = isMobile ? '16px' : '24px 28px';

  const stats = [
    { label: 'Total Volume',  value: data ? `$${fmt(data.totalVolume)}`  : '—' },
    { label: 'Total Trades',  value: data ? String(data.totalTrades)     : '—' },
    { label: 'Traders',       value: data ? String(data.uniqueTraders)   : '—' },
    { label: 'Avg Win Rate',  value: data?.avgWinRate != null ? `${fmt(data.avgWinRate * 100, 1)}%` : '—' },
  ];

  return (
    <div style={{
      height: '100%', overflowY: 'auto', background: 'var(--bg)',
      padding: pad, display: 'flex', flexDirection: 'column', gap: isMobile ? 14 : 20,
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, letterSpacing: '-0.02em' }}>Leaderboard</h2>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>S1 · Devnet</span>
      </div>

      {/* Stats cards */}
      <div className="cards-row" style={{ display: 'flex', gap: 12 }}>
        {stats.map(({ label, value }) => (
          <div key={label} style={{
            flex: 1, background: 'var(--bg2)',
            border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', top: 0, left: '15%', right: '15%', height: 1,
              background: 'linear-gradient(90deg, transparent, var(--cyan), transparent)', opacity: 0.3,
            }} />
            <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, fontWeight: 500 }}>{label}</div>
            <div style={{ fontSize: 22, fontFamily: 'var(--mono)', fontWeight: 500, letterSpacing: '-0.02em' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Rankings */}
      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)' }}>
          Scanning on-chain positions…
        </div>
      ) : error ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--red)' }}>
          {error}
        </div>
      ) : !data || data.traders.length === 0 ? (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 16, padding: '40px 0',
        }}>
          <div style={{ fontSize: 48, opacity: 0.3 }}>🏆</div>
          <div style={{ color: 'var(--text2)', fontSize: 16, fontWeight: 600 }}>No traders yet</div>
          <div style={{ color: 'var(--text3)', fontSize: 13, maxWidth: 400, textAlign: 'center', lineHeight: 1.6 }}>
            Be the first to trade an option and top the leaderboard.
          </div>
        </div>
      ) : (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '30px 1fr 60px 60px' : '40px 1fr 80px 90px 90px 70px',
            padding: '10px 16px', borderBottom: '1px solid var(--border)',
            fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600,
          }}>
            <div>#</div>
            <div>Trader</div>
            <div style={{ textAlign: 'right' }}>Trades</div>
            {!isMobile && <div style={{ textAlign: 'right' }}>Volume</div>}
            <div style={{ textAlign: 'right' }}>PnL</div>
            {!isMobile && <div style={{ textAlign: 'right' }}>Win%</div>}
          </div>
          {data.traders.slice(0, 100).map((t, i) => (
            <div key={t.owner} style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '30px 1fr 60px 60px' : '40px 1fr 80px 90px 90px 70px',
              padding: '12px 16px', borderBottom: '1px solid var(--border)',
              fontSize: 12, alignItems: 'center',
              background: i < 3 ? 'rgba(85,195,233,0.03)' : 'transparent',
            }}>
              <div style={{
                fontFamily: 'var(--mono)', fontWeight: 700,
                color: i === 0 ? 'var(--amber)' : i === 1 ? 'var(--cyan)' : i === 2 ? 'var(--green)' : 'var(--text3)',
              }}>
                {i + 1}
              </div>
              <a href={solscanAccount(t.owner)} target="_blank" rel="noreferrer" style={{
                fontFamily: 'var(--mono)', color: 'var(--text)',
                textDecoration: 'none',
              }}>
                {shortAddr(t.owner)}
              </a>
              <div style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text2)' }}>
                {t.trades}
              </div>
              {!isMobile && (
                <div style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text2)' }}>
                  ${fmt(t.volume)}
                </div>
              )}
              <div style={{
                textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600,
                color: t.pnl > 0 ? 'var(--green)' : t.pnl < 0 ? 'var(--red)' : 'var(--text3)',
              }}>
                {t.pnl > 0 ? '+' : ''}${fmt(t.pnl)}
              </div>
              {!isMobile && (
                <div style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text2)' }}>
                  {fmt(t.winRate * 100, 0)}%
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
