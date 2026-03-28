'use client';
import React from 'react';
import type { Side } from '@/types';

interface Props {
  premium: number;
  totalPremium: number;
  side: Side;
}

export const PremiumDisplay = React.memo(function PremiumDisplay({ premium, totalPremium, side }: Props) {
  const color  = side === 'call' ? 'var(--green)' : 'var(--red)';
  const fmtUSD = (v: number) =>
    v < 0.01
      ? v.toFixed(4)
      : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div style={{
      padding: '10px 0',
      borderTop: '1px solid var(--border)',
      borderBottom: '1px solid var(--border)',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
        Premium
      </div>
      {/* Big: total cost (size × unit) */}
      <div className="mono" style={{ fontSize: 22, fontWeight: 500, color }}>
        ${fmtUSD(totalPremium)}
      </div>
      {/* Small: per-unit price */}
      <div className="mono" style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
        ${fmtUSD(premium)} per unit
      </div>
    </div>
  );
});
