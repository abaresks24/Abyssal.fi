'use client';
import React from 'react';
import { useOptionBuilder } from '@/hooks/useOptionBuilder';

export const SideToggle = React.memo(function SideToggle() {
  const { side, setSide } = useOptionBuilder();

  return (
    <div style={{
      display: 'flex', gap: 0,
      border: '1px solid var(--border)',
      borderRadius: 6, overflow: 'hidden',
    }}>
      {(['call', 'put'] as const).map(s => {
        const active = side === s;
        const isCall = s === 'call';
        const color = isCall ? 'var(--green)' : 'var(--red)';
        const dimBg = isCall ? 'var(--green-dim)' : 'var(--red-dim)';
        return (
          <button
            key={s}
            onClick={() => setSide(s)}
            style={{
              flex: 1, padding: '8px 0', fontSize: 12, fontWeight: 600,
              background: active ? dimBg : 'transparent',
              border: 'none',
              borderRight: isCall ? '1px solid var(--border)' : 'none',
              color: active ? color : 'var(--text3)',
              cursor: 'pointer',
              letterSpacing: '0.04em',
              transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: active ? `inset 0 -2px 0 ${color}` : 'none',
            }}
          >
            {isCall ? 'Call' : 'Put'}
          </button>
        );
      })}
    </div>
  );
});
