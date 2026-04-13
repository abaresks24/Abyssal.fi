'use client';
import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { usePositions } from '@/hooks/usePositions';
import { solscanAccount } from '@/lib/constants';
import type { Market, Side, OptionPositionAccount } from '@/types';

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtExpiry(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

function SummaryCard({ label, value, color }: { label: string; value: string; color?: string }) {
  const accentColor = color ?? 'var(--cyan)';
  return (
    <div style={{
      flex: 1, background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '16px 20px',
      position: 'relative', overflow: 'hidden',
      transition: 'border-color 0.2s',
    }}>
      {/* Top accent line */}
      <div style={{
        position: 'absolute', top: 0, left: '15%', right: '15%', height: 1,
        background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`,
        opacity: 0.3,
      }} />
      <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 22, fontFamily: 'var(--mono)', color: color ?? 'var(--text)', fontWeight: 500, letterSpacing: '-0.02em' }}>{value}</div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '48px 0', gap: 12, color: 'var(--text3)',
    }}>
      <span style={{ fontSize: 32 }}>○</span>
      <span style={{ fontSize: 13, textAlign: 'center', padding: '0 24px' }}>{label}</span>
    </div>
  );
}

function ActionBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 8px', border: `1px solid ${color}33`, borderRadius: 4,
        background: 'transparent', color, fontSize: 11, fontWeight: 600, cursor: 'pointer',
        transition: 'background 0.12s', whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = `${color}18`)}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {label}
    </button>
  );
}

type Filter = 'open' | 'history';

export function Portfolio() {
  const { publicKey } = useWallet();
  const { isMobile } = useBreakpoint();
  const [filter, setFilter] = useState<Filter>('open');

  const { positions, loading, refetch } = usePositions(publicKey);

  const open    = positions.filter(p => p.status === 'open');
  const history = positions.filter(p => p.status !== 'open');
  const shown   = filter === 'open' ? open : history;

  const totalPremium = open.reduce((s, p) => s + p.premiumPaid, 0);
  const realizedPnl  = history.reduce((s, p) => s + p.payoffReceived - p.premiumPaid, 0);

  return (
    <div style={{
      height: '100%', overflowY: 'auto', background: 'var(--bg)',
      padding: isMobile ? '16px' : '24px 28px',
      display: 'flex', flexDirection: 'column', gap: isMobile ? 14 : 20,
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, letterSpacing: '-0.02em' }}>Portfolio</h2>
        <div style={{ flex: 1 }} />
        <button
          onClick={refetch}
          disabled={loading}
          style={{ fontSize: 12, color: 'var(--text3)', background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', opacity: loading ? 0.5 : 1 }}
        >
          {loading ? 'Loading…' : '↻ Refresh'}
        </button>
      </div>

      {/* Stats */}
      <div className="cards-row" style={{ display: 'flex', gap: 12 }}>
        <SummaryCard label="Open Positions"  value={loading ? '…' : String(open.length)} />
        <SummaryCard label="Total Premium Paid" value={loading ? '…' : `$${fmt(totalPremium)}`} />
        <SummaryCard
          label="Realized P&L"
          value={loading ? '…' : `${realizedPnl >= 0 ? '+' : ''}$${fmt(Math.abs(realizedPnl))}`}
          color={realizedPnl > 0 ? 'var(--green)' : realizedPnl < 0 ? 'var(--red)' : undefined}
        />
        <SummaryCard label="Settled" value={loading ? '…' : String(history.length)} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        {(['open', 'history'] as Filter[]).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: isMobile ? '8px 16px' : '10px 20px',
            border: 'none',
            borderBottom: filter === f ? '2px solid var(--cyan)' : '2px solid transparent',
            background: 'transparent',
            color: filter === f ? 'var(--text)' : 'var(--text3)',
            fontSize: 13, fontWeight: filter === f ? 600 : 400,
            cursor: 'pointer', marginBottom: -1, transition: 'color 0.15s',
          }}>
            {f === 'open' ? `Open (${open.length})` : `History (${history.length})`}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="table-scroll" style={{ borderRadius: 8, border: '1px solid var(--border)' }}>
        <div style={{ background: 'var(--bg2)', minWidth: isMobile ? 640 : 'auto', borderRadius: 8, overflow: 'hidden' }}>
          {!publicKey ? (
            <EmptyState label="Connect your wallet to view your positions" />
          ) : loading ? (
            <EmptyState label="Loading positions from chain…" />
          ) : shown.length === 0 ? (
            <EmptyState label={
              filter === 'open'
                ? 'No open positions — head to Trade to open your first option'
                : 'No settled positions yet'
            } />
          ) : (
            <>
              {/* Header row */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr 60px 80px 70px 70px 80px 100px' : '1fr 70px 90px 80px 70px 90px 80px 110px',
                padding: '10px 16px',
                background: 'var(--bg)', borderBottom: '1px solid var(--border)',
                fontSize: 11, color: 'var(--text3)',
                textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>
                <span>Series</span>
                <span>Type</span>
                <span>Strike</span>
                <span>Expiry</span>
                <span>Size</span>
                <span style={{ textAlign: 'right' }}>Premium</span>
                <span style={{ textAlign: 'right' }}>
                  {filter === 'open' ? 'Entry IV' : 'Payoff'}
                </span>
                <span style={{ textAlign: 'right' }}>Proof</span>
              </div>

              {shown.map(p => (
                <div key={p.pubkey} style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr 60px 80px 70px 70px 80px 100px' : '1fr 70px 90px 80px 70px 90px 80px 110px',
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--border)',
                  fontSize: 12, alignItems: 'center',
                }}>
                  <span style={{ fontWeight: 600 }}>{p.market}</span>
                  <span style={{ color: p.optionType === 'Call' ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                    {p.optionType.toUpperCase()}
                  </span>
                  <span style={{ fontFamily: 'var(--mono)' }}>${fmt(p.strike, 0)}</span>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--text2)', fontSize: 11 }}>
                    {fmtExpiry(p.expiry)}
                  </span>
                  <span style={{ fontFamily: 'var(--mono)' }}>{fmt(p.size, 4)}</span>
                  <span style={{ fontFamily: 'var(--mono)', textAlign: 'right' }}>${fmt(p.premiumPaid)}</span>
                  <span style={{ fontFamily: 'var(--mono)', textAlign: 'right', color: 'var(--text2)' }}>
                    {filter === 'open'
                      ? `${(p.entryIv * 100).toFixed(1)}%`
                      : `$${fmt(p.payoffReceived)}`
                    }
                  </span>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                    <a
                      href={solscanAccount(p.pubkey)}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        padding: '4px 7px', border: '1px solid var(--border2)', borderRadius: 4,
                        color: 'var(--cyan)', fontSize: 10, textDecoration: 'none', whiteSpace: 'nowrap',
                      }}
                    >
                      on-chain ↗
                    </a>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
