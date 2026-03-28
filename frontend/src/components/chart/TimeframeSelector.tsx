'use client';
import React from 'react';

export const TIMEFRAMES = [
  { label: '1m',  interval: '1m',  ms: 60_000 },
  { label: '5m',  interval: '5m',  ms: 300_000 },
  { label: '15m', interval: '15m', ms: 900_000 },
  { label: '1h',  interval: '1h',  ms: 3_600_000 },
  { label: '4h',  interval: '4h',  ms: 14_400_000 },
  { label: '1d',  interval: '1d',  ms: 86_400_000 },
] as const;

export type TfInterval = typeof TIMEFRAMES[number]['interval'];

interface Props {
  current: TfInterval;
  onChange: (tf: TfInterval) => void;
}

export function TimeframeSelector({ current, onChange }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '0 2px' }}>
      {TIMEFRAMES.map(({ label, interval }) => (
        <button
          key={interval}
          onClick={() => onChange(interval)}
          style={{
            padding: '3px 7px',
            borderRadius: 3,
            border: 'none',
            background: current === interval ? 'var(--bg3)' : 'transparent',
            color: current === interval ? 'var(--cyan)' : 'var(--text3)',
            fontSize: 11,
            fontFamily: 'var(--mono)',
            cursor: 'pointer',
            fontWeight: current === interval ? 600 : 400,
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
