'use client';
import React from 'react';
import type { Side } from '@/types';

interface Props {
  premium: number;
  totalPremium: number;
  side: Side;
}

export const PremiumDisplay = React.memo(function PremiumDisplay({ premium, totalPremium, side }: Props) {
  const color     = side === 'call' ? 'var(--green)' : 'var(--red)';
  const glowColor = side === 'call' ? 'rgba(2,199,123,0.15)' : 'rgba(235,54,90,0.15)';
  const fmtUSD = (v: number) =>
    v < 0.01
      ? v.toFixed(4)
      : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div style={{
      padding: '14px 12px',
      margin: '2px 0',
      background: `linear-gradient(135deg, ${glowColor} 0%, transparent 60%)`,
      borderRadius: 8,
      border: '1px solid var(--border)',
      textAlign: 'center',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Subtle top accent line */}
      <div style={{
        position: 'absolute', top: 0, left: '20%', right: '20%', height: 1,
        background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
        opacity: 0.4,
      }} />

      <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
        Premium
      </div>
      <div className="mono" style={{
        fontSize: 24, fontWeight: 500, color,
        textShadow: `0 0 20px ${glowColor}`,
        letterSpacing: '-0.02em',
      }}>
        ${fmtUSD(totalPremium)}
      </div>
      <div className="mono" style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
        ${fmtUSD(premium)} / unit
      </div>
    </div>
  );
});
