'use client';
import React from 'react';
import { useOptionBuilder } from '@/hooks/useOptionBuilder';

export const SideToggle = React.memo(function SideToggle() {
  const { side, setSide } = useOptionBuilder();

  return (
    <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border)', borderRadius: 5, overflow: 'hidden' }}>
      <button
        onClick={() => setSide('call')}
        style={{
          flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600,
          background: side === 'call' ? 'var(--green-dim)' : 'transparent',
          border: 'none',
          borderRight: '1px solid var(--border)',
          color: side === 'call' ? 'var(--green)' : 'var(--text3)',
          cursor: 'pointer',
        }}
      >
        Call
      </button>
      <button
        onClick={() => setSide('put')}
        style={{
          flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600,
          background: side === 'put' ? 'var(--red-dim)' : 'transparent',
          border: 'none',
          color: side === 'put' ? 'var(--red)' : 'var(--text3)',
          cursor: 'pointer',
        }}
      >
        Put
      </button>
    </div>
  );
});
