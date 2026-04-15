'use client';
import React from 'react';
import { useBreakpoint } from '@/hooks/useBreakpoint';

export function Leaderboard() {
  const { isMobile } = useBreakpoint();
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
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>
          S1 · Devnet
        </span>
      </div>

      {/* Stats cards */}
      <div className="cards-row" style={{ display: 'flex', gap: 12 }}>
        {[
          { label: 'Total Volume',  value: '$0' },
          { label: 'Total Trades',  value: '0' },
          { label: 'Traders',       value: '0' },
          { label: 'Avg Win Rate',  value: '—' },
        ].map(({ label, value }) => (
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

      {/* Coming soon state */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 16, padding: '40px 0',
      }}>
        <div style={{ fontSize: 48, opacity: 0.3 }}>🏆</div>
        <div style={{ color: 'var(--text2)', fontSize: 16, fontWeight: 600 }}>Leaderboard coming soon</div>
        <div style={{ color: 'var(--text3)', fontSize: 13, maxWidth: 400, textAlign: 'center', lineHeight: 1.6 }}>
          Rankings will be generated from on-chain trading activity.
          Start trading to climb the leaderboard when Season 1 launches.
        </div>
      </div>
    </div>
  );
}
