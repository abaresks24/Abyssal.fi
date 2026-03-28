'use client';
import React from 'react';
import type { Greeks } from '@/types';

interface Props { greeks: Greeks | null; }

export const GreeksDisplay = React.memo(function GreeksDisplay({ greeks }: Props) {
  if (!greeks) return null;

  const items = [
    { label: 'Δ Delta',  value: greeks.delta.toFixed(3),  color: 'var(--cyan)' },
    { label: 'Γ Gamma',  value: greeks.gamma.toFixed(5),  color: 'var(--text2)' },
    { label: 'Θ Theta',  value: `$${greeks.theta.toFixed(2)}/d`, color: 'var(--amber)' },
    { label: 'ν Vega',   value: `$${greeks.vega.toFixed(2)}/%`, color: 'var(--text2)' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 0' }}>
      {items.map(({ label, value, color }) => (
        <div key={label} style={{ padding: '4px 0' }}>
          <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
            {label}
          </div>
          <div className="mono" style={{ fontSize: 12, color, fontWeight: 500 }}>
            {value}
          </div>
        </div>
      ))}
    </div>
  );
});
