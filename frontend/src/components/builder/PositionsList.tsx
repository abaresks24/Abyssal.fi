'use client';
import React from 'react';
import type { Position } from '@/types';

// Mock positions until on-chain fetch is wired
const MOCK: Position[] = [];

export const PositionsList = React.memo(function PositionsList() {
  const positions = MOCK;

  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
        Open Positions ({positions.length})
      </div>
      {positions.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', padding: '12px 0' }}>
          No open positions
        </div>
      ) : (
        positions.map((p) => (
          <div key={p.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: p.side === 'call' ? 'var(--green)' : 'var(--red)' }}>
                {p.market} {p.side.toUpperCase()} ${p.strike.toLocaleString('en-US')}
              </span>
              <span className="mono" style={{ fontSize: 11, color: p.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {p.pnl >= 0 ? '+' : ''}${p.pnl.toFixed(2)}
              </span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
              {p.size} {p.market} · {p.expiry} · IV {(p.entryIV * 100).toFixed(1)}%
            </div>
          </div>
        ))
      )}
    </div>
  );
});
