'use client';
import React from 'react';
import type { Side } from '@/types';

interface Props {
  strike: number;
  expiry: string;
  size: number;
  market: string;
  totalPremium: number;
  fee: number;
  breakeven: number;
  side: Side;
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
      <span style={{ fontSize: 11, color: 'var(--text3)' }}>{label}</span>
      <span className="mono" style={{ fontSize: 11, color: color ?? 'var(--text)' }}>{value}</span>
    </div>
  );
}

export const OrderSummary = React.memo(function OrderSummary({
  strike, expiry, size, market, totalPremium, fee, breakeven, side,
}: Props) {
  const fmtP = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  const fmtU = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
      <Row label="Strike"    value={`$${fmtP(strike)}`} />
      <Row label="Expiry"    value={expiry} />
      <Row label="Size"      value={`${size} ${market}`} />
      <Row label="Premium"   value={`$${fmtU(totalPremium)}`} color="var(--cyan)" />
      <Row label="Fee (5bps)" value={`$${fmtU(fee)}`} color="var(--text2)" />
      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
      <Row
        label="Total cost"
        value={`$${fmtU(totalPremium + fee)}`}
        color="var(--text)"
      />
      <Row
        label="Breakeven"
        value={`$${fmtP(breakeven)}`}
        color="var(--amber)"
      />
    </div>
  );
});
