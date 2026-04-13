'use client';
import React from 'react';
import type { Greeks } from '@/types';

interface Props { greeks: Greeks | null; }

export const GreeksDisplay = React.memo(function GreeksDisplay({ greeks }: Props) {
  if (!greeks) return null;

  const items = [
    { symbol: 'Δ', label: 'Delta', value: greeks.delta.toFixed(3), color: 'var(--cyan)',  pct: Math.abs(greeks.delta) * 100 },
    { symbol: 'Γ', label: 'Gamma', value: greeks.gamma.toFixed(5), color: 'var(--text2)', pct: Math.min(greeks.gamma * 1000, 100) },
    { symbol: 'Θ', label: 'Theta', value: `${greeks.theta.toFixed(2)}/d`, color: 'var(--amber)', pct: Math.min(Math.abs(greeks.theta) * 2, 100) },
    { symbol: 'ν', label: 'Vega',  value: `${greeks.vega.toFixed(2)}/%`, color: 'var(--text2)', pct: Math.min(greeks.vega * 5, 100) },
  ];

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px',
    }}>
      {items.map(({ symbol, label, value, color, pct }) => (
        <div key={label} style={{
          padding: '8px 10px',
          background: 'var(--bg2)',
          borderRadius: 6,
          border: '1px solid var(--border)',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Mini bar indicator */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0,
            width: `${pct}%`, height: 2,
            background: color, opacity: 0.4,
            borderRadius: '0 1px 0 0',
            transition: 'width 0.3s ease',
          }} />
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3,
          }}>
            <span style={{ fontSize: 13, color, fontWeight: 700 }}>{symbol}</span>
            <span style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {label}
            </span>
          </div>
          <div className="mono" style={{ fontSize: 12, color, fontWeight: 500 }}>
            {value}
          </div>
        </div>
      ))}
    </div>
  );
});
