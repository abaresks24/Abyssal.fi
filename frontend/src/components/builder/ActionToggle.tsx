'use client';
import React from 'react';
import { useOptionBuilder } from '@/hooks/useOptionBuilder';

export const ActionToggle = React.memo(function ActionToggle() {
  const { action, setAction } = useOptionBuilder();

  return (
    <div style={{
      display: 'flex', gap: 0,
      border: '1px solid var(--border)',
      borderRadius: 5, overflow: 'hidden',
    }}>
      <button
        onClick={() => setAction('buy')}
        style={{
          flex: 1, padding: '8px 0', fontSize: 12, fontWeight: 700,
          background: action === 'buy' ? 'rgba(85,195,233,0.15)' : 'transparent',
          border: 'none',
          borderRight: '1px solid var(--border)',
          color: action === 'buy' ? 'var(--cyan)' : 'var(--text3)',
          cursor: 'pointer',
          letterSpacing: '0.04em',
        }}
      >
        Buy
      </button>
      <button
        onClick={() => setAction('sell')}
        style={{
          flex: 1, padding: '8px 0', fontSize: 12, fontWeight: 700,
          background: action === 'sell' ? 'rgba(236,202,90,0.12)' : 'transparent',
          border: 'none',
          color: action === 'sell' ? 'var(--amber)' : 'var(--text3)',
          cursor: 'pointer',
          letterSpacing: '0.04em',
        }}
      >
        Sell
      </button>
    </div>
  );
});
