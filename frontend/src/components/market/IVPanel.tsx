'use client';
import React from 'react';
import { useOptionBuilder } from '@/hooks/useOptionBuilder';
import { useAFVR } from '@/hooks/useAFVR';
import { useFundingRate } from '@/hooks/useFundingRate';

export function IVPanel() {
  const { market } = useOptionBuilder();
  const { iv, ivPercent, isStale } = useAFVR(market);
  const { currentRate } = useFundingRate(market);

  const ivColor = iv < 0.5 ? 'var(--green)' : iv < 0.9 ? 'var(--amber)' : 'var(--red)';

  return (
    <div style={{ padding: '10px 12px' }}>
      <div style={{ fontSize: 10, color: 'var(--text3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
        IV Surface
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text2)' }}>AFVR IV</span>
          <span className="mono" style={{ fontSize: 13, fontWeight: 500, color: ivColor }}>
            {isStale ? '—' : ivPercent}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text2)' }}>Funding 8h</span>
          <span className="mono" style={{ fontSize: 11, color: currentRate >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {(currentRate * 100).toFixed(4)}%
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text2)' }}>Model</span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text3)' }}>AFVR</span>
        </div>
      </div>
    </div>
  );
}
