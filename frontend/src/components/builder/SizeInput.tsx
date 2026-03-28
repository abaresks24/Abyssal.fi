'use client';
import React, { useCallback, useRef } from 'react';
import { useOptionBuilder } from '@/hooks/useOptionBuilder';

const QUICK_SIZES = [0.1, 0.25, 0.5, 1];

interface Props { spot: number; }

export const SizeInput = React.memo(function SizeInput({ spot }: Props) {
  const { size, market, setSize } = useOptionBuilder();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!isNaN(v) && v > 0) setSize(v);
    }, 150);
  }, [setSize]);

  const notional = spot > 0 ? (size * spot).toLocaleString('en-US', { maximumFractionDigits: 0 }) : null;

  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
        Size ({market})
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        {QUICK_SIZES.map((s) => (
          <button
            key={s}
            onClick={() => setSize(s)}
            style={{
              flex: 1, padding: '4px 0', fontSize: 11, fontFamily: 'var(--mono)',
              border: `1px solid ${size === s ? 'var(--cyan)' : 'var(--border)'}`,
              borderRadius: 3,
              background: size === s ? 'var(--cyan-dim)' : 'var(--bg2)',
              color: size === s ? 'var(--cyan)' : 'var(--text3)',
              cursor: 'pointer',
            }}
          >
            {s}
          </button>
        ))}
      </div>
      <input
        type="number"
        defaultValue={size}
        onChange={handleChange}
        step={0.01}
        min={0.01}
        style={{
          width: '100%', padding: '6px 8px',
          border: '1px solid var(--border)', borderRadius: 3,
          fontSize: 13, fontFamily: 'var(--mono)',
          color: 'var(--text)', background: 'var(--bg2)',
        }}
      />
      {notional && (
        <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
          ≈ ${notional} notional
        </div>
      )}
    </div>
  );
});
