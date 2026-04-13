'use client';
import React from 'react';
import { useOptionBuilder } from '@/hooks/useOptionBuilder';

export const ActionToggle = React.memo(function ActionToggle() {
  const { action, setAction } = useOptionBuilder();

  return (
    <div style={{
      display: 'flex', gap: 0,
      border: '1px solid var(--border)',
      borderRadius: 6, overflow: 'hidden',
      position: 'relative',
    }}>
      {(['buy', 'sell'] as const).map(a => {
        const active = action === a;
        const isBuy = a === 'buy';
        return (
          <button
            key={a}
            onClick={() => setAction(a)}
            style={{
              flex: 1, padding: '9px 0', fontSize: 12, fontWeight: 700,
              background: active
                ? (isBuy ? 'rgba(85,195,233,0.15)' : 'rgba(236,202,90,0.12)')
                : 'transparent',
              border: 'none',
              borderRight: isBuy ? '1px solid var(--border)' : 'none',
              color: active
                ? (isBuy ? 'var(--cyan)' : 'var(--amber)')
                : 'var(--text3)',
              cursor: 'pointer',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: active
                ? (isBuy
                  ? 'inset 0 -2px 0 var(--cyan)'
                  : 'inset 0 -2px 0 var(--amber)')
                : 'none',
            }}
          >
            {isBuy ? 'Buy' : 'Sell'}
          </button>
        );
      })}
    </div>
  );
});
