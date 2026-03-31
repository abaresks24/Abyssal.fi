'use client';
import React, { useState } from 'react';
import { useBreakpoint } from '@/hooks/useBreakpoint';

interface Trader {
  rank: number;
  address: string;
  label?: string;
  volume: number;
  pnl: number;
  pnlPct: number;
  trades: number;
  winRate: number;
  bestTrade: number;
}

const MOCK_TRADERS: Trader[] = [
  { rank: 1,  address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', label: 'Kraken',   volume: 842500, pnl:  18420, pnlPct: 21.8,  trades: 47, winRate: 72, bestTrade:  6200 },
  { rank: 2,  address: 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmkE5By5H', label: 'Nautilus', volume: 611200, pnl:  12850, pnlPct: 16.4,  trades: 31, winRate: 68, bestTrade:  4100 },
  { rank: 3,  address: '4mFY8kPxFiA3E9mTwByPUzKFfGTBsNkMXCL7XBbZBTGW',                    volume: 498700, pnl:   9340, pnlPct: 13.2,  trades: 22, winRate: 64, bestTrade:  3800 },
  { rank: 4,  address: 'BVtBkgQV9x4LMGR6dGHJSaLzGaFd4mEsUHRpBzN5QDNX',                    volume: 374100, pnl:   6710, pnlPct:  9.8,  trades: 18, winRate: 61, bestTrade:  2900 },
  { rank: 5,  address: '9ZNTfG4NyQgxy2SWjSiQoUyBPgtyLAN4PNiWe5ouGZzT',                    volume: 291500, pnl:   4230, pnlPct:  7.1,  trades: 15, winRate: 60, bestTrade:  1800 },
  { rank: 6,  address: 'GmJDZZsdBtW5gfqKFcNDQVFDGKWU8mDJepGPKkBCX2jF',                    volume: 184200, pnl:   2140, pnlPct:  4.3,  trades: 12, winRate: 58, bestTrade:  1100 },
  { rank: 7,  address: 'Fwv7MzLJJfxL7bRV62UPsRgtMQ3bVcAYPGT8hzHK9sXe',                    volume: 142800, pnl:   1760, pnlPct:  3.9,  trades: 9,  winRate: 56, bestTrade:   920 },
  { rank: 8,  address: 'CJsLwbP1gg7AoBzqCBxBK8MimNpCsrRhBzAp5rHrB5sT',                    volume:  97400, pnl:    890, pnlPct:  2.4,  trades: 7,  winRate: 57, bestTrade:   580 },
  { rank: 9,  address: 'E3nhSBnWxSXFqPaYPrWzMF5kZVF4EzNQMZHpTRxqyM7f',                    volume:  63100, pnl:   -430, pnlPct: -1.2,  trades: 5,  winRate: 40, bestTrade:   210 },
  { rank: 10, address: 'HU6LYvHpBoFrJN6LFwVKyFTFVqpDM5MHpJK3d8Nn7GRo',                    volume:  41800, pnl:  -1240, pnlPct: -4.1,  trades: 4,  winRate: 25, bestTrade:   150 },
];

type Sort = 'pnl' | 'volume' | 'trades' | 'winRate';

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function shortAddr(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

export function Leaderboard() {
  const [sort, setSort] = useState<Sort>('pnl');
  const { isMobile } = useBreakpoint();

  const sorted = [...MOCK_TRADERS].sort((a, b) => {
    if (sort === 'pnl')     return b.pnl - a.pnl;
    if (sort === 'volume')  return b.volume - a.volume;
    if (sort === 'trades')  return b.trades - a.trades;
    if (sort === 'winRate') return b.winRate - a.winRate;
    return 0;
  }).map((t, i) => ({ ...t, rank: i + 1 }));

  const totalVolume = MOCK_TRADERS.reduce((s, t) => s + t.volume, 0);
  const totalTrades = MOCK_TRADERS.reduce((s, t) => s + t.trades, 0);
  const avgWinRate  = MOCK_TRADERS.reduce((s, t) => s + t.winRate, 0) / MOCK_TRADERS.length;

  const ColHeader = ({ label, field }: { label: string; field: Sort }) => (
    <span
      onClick={() => setSort(field)}
      style={{
        cursor: 'pointer',
        color: sort === field ? 'var(--cyan)' : 'var(--text3)',
        userSelect: 'none',
        display: 'flex', alignItems: 'center', gap: 4,
      }}
    >
      {label}{sort === field && <span style={{ fontSize: 9 }}>▼</span>}
    </span>
  );

  const pad = isMobile ? '16px' : '24px 28px';

  return (
    <div style={{
      height: '100%', overflowY: 'auto', background: 'var(--bg)',
      padding: pad, display: 'flex', flexDirection: 'column', gap: isMobile ? 14 : 20,
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, letterSpacing: '-0.02em' }}>Leaderboard</h2>
        <div style={{ flex: 1 }} />
        <span style={{
          fontSize: 11, padding: '3px 10px', borderRadius: 20,
          background: 'var(--amber-dim)', color: 'var(--amber)',
          border: '1px solid rgba(236,202,90,0.25)', fontWeight: 600,
        }}>
          S1 · Devnet
        </span>
      </div>

      {/* Stats cards — wrap on mobile */}
      <div className="cards-row" style={{ display: 'flex', gap: 12 }}>
        {[
          { label: 'Total Volume',  value: `$${fmt(totalVolume / 1000, 1)}K` },
          { label: 'Total Trades',  value: String(totalTrades) },
          { label: 'Traders',       value: String(MOCK_TRADERS.length) },
          { label: 'Avg Win Rate',  value: `${fmt(avgWinRate, 0)}%` },
        ].map(({ label, value }) => (
          <div key={label} style={{
            flex: 1, background: 'var(--bg2)',
            border: '1px solid var(--border)', borderRadius: 8, padding: '14px 18px',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 20, fontFamily: 'var(--mono)' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Top 3 podium — stack on mobile */}
      <div style={{ display: 'flex', gap: 12, flexDirection: isMobile ? 'column' : 'row' }}>
        {sorted.slice(0, 3).map(t => (
          <div key={t.address} style={{
            flex: 1,
            background: t.rank === 1
              ? 'linear-gradient(135deg, rgba(236,202,90,0.08) 0%, var(--bg2) 100%)'
              : 'var(--bg2)',
            border: `1px solid ${t.rank === 1 ? 'rgba(236,202,90,0.3)' : 'var(--border)'}`,
            borderRadius: 8, padding: '18px 20px',
            display: 'flex', flexDirection: isMobile ? 'row' : 'column',
            gap: 8, alignItems: isMobile ? 'center' : 'flex-start',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: isMobile ? 1 : 'unset' }}>
              <span style={{ fontSize: 22 }}>{MEDAL[t.rank]}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{t.label ?? shortAddr(t.address)}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{shortAddr(t.address)}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: isMobile ? 24 : 16 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>P&L</div>
                <div style={{ fontSize: 16, fontFamily: 'var(--mono)', color: t.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {t.pnl >= 0 ? '+' : ''}${fmt(t.pnl, 0)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Win %</div>
                <div style={{ fontSize: 16, fontFamily: 'var(--mono)', color: 'var(--cyan)' }}>{t.winRate}%</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Full table — horizontal scroll on mobile */}
      <div className="table-scroll" style={{ borderRadius: 8, border: '1px solid var(--border)' }}>
        <div style={{ background: 'var(--bg2)', minWidth: 560, borderRadius: 8, overflow: 'hidden' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '40px 1fr 110px 110px 60px 80px 110px',
            padding: '10px 16px', background: 'var(--bg)',
            borderBottom: '1px solid var(--border)',
            fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            <span style={{ color: 'var(--text3)' }}>#</span>
            <span style={{ color: 'var(--text3)' }}>Trader</span>
            <ColHeader label="Volume" field="volume" />
            <ColHeader label="P&L"    field="pnl"    />
            <ColHeader label="Trades" field="trades" />
            <ColHeader label="Win %"  field="winRate"/>
            <span style={{ color: 'var(--text3)', textAlign: 'right' }}>Best Trade</span>
          </div>

          {sorted.map((t, i) => (
            <div
              key={t.address}
              style={{
                display: 'grid',
                gridTemplateColumns: '40px 1fr 110px 110px 60px 80px 110px',
                padding: '12px 16px',
                borderBottom: i < sorted.length - 1 ? '1px solid var(--border)' : 'none',
                fontSize: 12, alignItems: 'center',
                background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(85,195,233,0.04)')}
              onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)')}
            >
              <span style={{
                fontFamily: 'var(--mono)',
                color: t.rank <= 3 ? 'var(--amber)' : 'var(--text3)',
                fontSize: t.rank <= 3 ? 13 : 12,
              }}>
                {t.rank}
              </span>
              <div>
                <div style={{ fontWeight: 600 }}>{t.label ?? shortAddr(t.address)}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{shortAddr(t.address)}</div>
              </div>
              <span className="mono" style={{ color: 'var(--text2)' }}>${fmt(t.volume / 1000, 1)}K</span>
              <span className="mono" style={{ color: t.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {t.pnl >= 0 ? '+' : ''}${fmt(t.pnl, 0)}
                <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 4 }}>
                  ({t.pnlPct >= 0 ? '+' : ''}{t.pnlPct.toFixed(1)}%)
                </span>
              </span>
              <span className="mono" style={{ color: 'var(--text2)' }}>{t.trades}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ height: 4, borderRadius: 2, flex: 1, background: 'var(--bg3)', position: 'relative', overflow: 'hidden' }}>
                  <div style={{
                    position: 'absolute', left: 0, top: 0, height: '100%',
                    width: `${t.winRate}%`,
                    background: t.winRate >= 60 ? 'var(--green)' : t.winRate >= 50 ? 'var(--cyan)' : 'var(--red)',
                    borderRadius: 2,
                  }} />
                </div>
                <span className="mono" style={{ fontSize: 11, color: t.winRate >= 60 ? 'var(--green)' : 'var(--text2)', minWidth: 30, textAlign: 'right' }}>
                  {t.winRate}%
                </span>
              </div>
              <span className="mono" style={{ color: 'var(--green)', textAlign: 'right' }}>+${fmt(t.bestTrade, 0)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
