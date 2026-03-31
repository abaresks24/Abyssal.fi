'use client';
import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import type { Market, Side } from '@/types';

// ── Mock positions (replace with on-chain fetch once pools are live) ──────────

interface PortfolioPosition {
  id: string;
  market: Market;
  side: Side;
  strike: number;
  expiry: string;
  size: number;
  premiumPaid: number;
  currentPremium: number;
  iv: number;
  openedAt: string;
  status: 'open' | 'expired' | 'settled';
}

const MOCK: PortfolioPosition[] = [];

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function SummaryCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      flex: 1,
      background: 'var(--bg2)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '14px 18px',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--mono)', color: color ?? 'var(--text)' }}>{value}</div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ label }: { label: string }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 0',
      gap: 12,
      color: 'var(--text3)',
    }}>
      <span style={{ fontSize: 32 }}>○</span>
      <span style={{ fontSize: 13 }}>{label}</span>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

type Filter = 'open' | 'history';

export function Portfolio() {
  const { connected } = useWallet();
  const [filter, setFilter] = useState<Filter>('open');

  const positions = MOCK.filter(p =>
    filter === 'open' ? p.status === 'open' : p.status !== 'open',
  );

  const totalPnl     = positions.reduce((s, p) => s + (p.currentPremium - p.premiumPaid) * p.size, 0);
  const totalNotional = positions.reduce((s, p) => s + p.premiumPaid * p.size, 0);

  return (
    <div style={{
      height: '100%',
      overflowY: 'auto',
      background: 'var(--bg)',
      padding: '24px 28px',
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>Portfolio</h2>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
          {connected ? 'Live' : 'Connect wallet to view positions'}
        </span>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12 }}>
        <SummaryCard label="Open Positions" value={String(MOCK.filter(p => p.status === 'open').length)} />
        <SummaryCard label="Total Notional" value={`$${fmt(totalNotional)}`} />
        <SummaryCard
          label="Unrealized P&L"
          value={`${totalPnl >= 0 ? '+' : ''}$${fmt(Math.abs(totalPnl))}`}
          color={totalPnl >= 0 ? 'var(--green)' : totalPnl < 0 ? 'var(--red)' : undefined}
        />
        <SummaryCard label="Realized P&L" value="$0.00" />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', gap: 0 }}>
        {(['open', 'history'] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '10px 20px',
              border: 'none',
              borderBottom: filter === f ? '2px solid var(--cyan)' : '2px solid transparent',
              background: 'transparent',
              color: filter === f ? 'var(--text)' : 'var(--text3)',
              fontSize: 13,
              fontWeight: filter === f ? 600 : 400,
              cursor: 'pointer',
              marginBottom: -1,
              transition: 'color 0.15s',
            }}
          >
            {f === 'open' ? 'Open Positions' : 'History'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        overflow: 'hidden',
      }}>
        {positions.length === 0 ? (
          <EmptyState label={
            !connected
              ? 'Connect your wallet to view your positions'
              : filter === 'open'
                ? 'No open positions — head to Trade to open your first option'
                : 'No trade history yet'
          } />
        ) : (
          <>
            {/* Table header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 80px 100px 80px 80px 90px 90px 90px 100px',
              padding: '10px 16px',
              background: 'var(--bg)',
              borderBottom: '1px solid var(--border)',
              fontSize: 11,
              color: 'var(--text3)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}>
              <span>Series</span>
              <span>Type</span>
              <span>Strike</span>
              <span>Expiry</span>
              <span>Size</span>
              <span style={{ textAlign: 'right' }}>Entry</span>
              <span style={{ textAlign: 'right' }}>Current</span>
              <span style={{ textAlign: 'right' }}>P&L</span>
              <span style={{ textAlign: 'right' }}>Action</span>
            </div>

            {positions.map(p => {
              const pnl = (p.currentPremium - p.premiumPaid) * p.size;
              return (
                <div key={p.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 80px 100px 80px 80px 90px 90px 90px 100px',
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--border)',
                  fontSize: 12,
                  alignItems: 'center',
                }}>
                  <span style={{ fontWeight: 600 }}>{p.market}-PERP</span>
                  <span style={{ color: p.side === 'call' ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                    {p.side.toUpperCase()}
                  </span>
                  <span className="mono">${fmt(p.strike, 0)}</span>
                  <span className="mono" style={{ color: 'var(--text2)' }}>{p.expiry}</span>
                  <span className="mono">{p.size}</span>
                  <span className="mono" style={{ textAlign: 'right' }}>${fmt(p.premiumPaid)}</span>
                  <span className="mono" style={{ textAlign: 'right' }}>${fmt(p.currentPremium)}</span>
                  <span className="mono" style={{ textAlign: 'right', color: pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {pnl >= 0 ? '+' : ''}${fmt(Math.abs(pnl))}
                  </span>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                    <ActionBtn label="Exercise" color="var(--green)" onClick={() => {}} />
                    <ActionBtn label="Close" color="var(--red)" onClick={() => {}} />
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

function ActionBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '4px 10px', border: `1px solid ${color}33`, borderRadius: 4,
      background: 'transparent', color, fontSize: 11, fontWeight: 600, cursor: 'pointer',
      transition: 'background 0.12s',
    }}
      onMouseEnter={e => (e.currentTarget.style.background = `${color}18`)}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {label}
    </button>
  );
}
