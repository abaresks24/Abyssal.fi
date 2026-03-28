'use client';
import React, { useCallback, useRef } from 'react';
import { useOptionBuilder } from '@/hooks/useOptionBuilder';

interface Props { spot: number; }

export const StrikeSelector = React.memo(function StrikeSelector({ spot }: Props) {
  const { strike, setStrike } = useOptionBuilder();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v) && v > 0) setStrike(v);
    else if (e.target.value === '') setStrike(0);
  }, [setStrike]);

  // Quick shortcuts relative to spot
  const shortcuts = spot > 0 ? [
    { label: 'ATM', value: Math.round(spot) },
    { label: '-5%', value: Math.round(spot * 0.95) },
    { label: '+5%', value: Math.round(spot * 1.05) },
    { label: '+10%', value: Math.round(spot * 1.10) },
  ] : [];

  const fmtSpot = spot > 0
    ? `$${spot.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Free-form input */}
      <div style={{
        display: 'flex', alignItems: 'center',
        border: `1px solid ${strike > 0 ? 'var(--cyan)' : 'var(--border2)'}`,
        borderRadius: 4, background: 'var(--bg2)',
        transition: 'border-color 0.12s',
      }}>
        <span style={{
          padding: '0 8px', fontSize: 13, color: 'var(--text3)',
          fontFamily: 'var(--mono)', borderRight: '1px solid var(--border)',
          lineHeight: '32px',
        }}>$</span>
        <input
          ref={inputRef}
          type="number"
          value={strike > 0 ? strike : ''}
          onChange={handleChange}
          placeholder={spot > 0 ? `Spot ${fmtSpot}` : 'Enter strike…'}
          min={1}
          step={1}
          style={{
            flex: 1, padding: '6px 8px',
            border: 'none', background: 'transparent',
            fontSize: 13, fontFamily: 'var(--mono)',
            color: 'var(--text)',
          }}
        />
        {strike > 0 && spot > 0 && (
          <span style={{
            padding: '0 8px', fontSize: 10, fontFamily: 'var(--mono)',
            color: strike > spot ? 'var(--red)' : strike < spot ? 'var(--green)' : 'var(--cyan)',
            whiteSpace: 'nowrap',
          }}>
            {strike === Math.round(spot)
              ? 'ATM'
              : `${strike > spot ? '+' : ''}${(((strike - spot) / spot) * 100).toFixed(1)}%`}
          </span>
        )}
      </div>

      {/* Quick-set buttons */}
      {shortcuts.length > 0 && (
        <div style={{ display: 'flex', gap: 4 }}>
          {shortcuts.map(({ label, value }) => (
            <button
              key={label}
              onClick={() => {
                setStrike(value);
                if (inputRef.current) inputRef.current.value = String(value);
              }}
              style={{
                flex: 1, padding: '3px 0', fontSize: 10,
                fontFamily: 'var(--mono)',
                border: `1px solid ${strike === value ? 'var(--cyan)' : 'var(--border)'}`,
                borderRadius: 3,
                background: strike === value ? 'var(--cyan-dim)' : 'var(--bg2)',
                color: strike === value ? 'var(--cyan)' : 'var(--text3)',
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
