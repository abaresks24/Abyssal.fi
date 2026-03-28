'use client';
import React from 'react';
import { useOptionBuilder } from '@/hooks/useOptionBuilder';
import { EXPIRY_OPTIONS } from '@/lib/constants';
import type { Expiry } from '@/types';

export function ExpirySelector() {
  const { expiry, setExpiry } = useOptionBuilder();

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      padding: '6px 12px',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 10, color: 'var(--text3)', marginRight: 6 }}>EXPIRY</span>
      {EXPIRY_OPTIONS.map((e: Expiry) => (
        <button
          key={e}
          onClick={() => setExpiry(e)}
          style={{
            padding: '2px 8px',
            borderRadius: 3,
            border: `1px solid ${expiry === e ? 'var(--cyan)' : 'var(--border2)'}`,
            background: expiry === e ? 'var(--cyan-dim)' : 'transparent',
            color: expiry === e ? 'var(--cyan)' : 'var(--text3)',
            fontSize: 11,
            fontFamily: 'var(--mono)',
            cursor: 'pointer',
          }}
        >
          {e}
        </button>
      ))}
    </div>
  );
}
