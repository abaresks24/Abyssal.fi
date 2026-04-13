'use client';
import React from 'react';
import type { Side, Action } from '@/types';

interface Props {
  strike:       number;
  expiry:       string;
  size:         number;
  market:       string;
  totalPremium: number;
  fee:          number;
  breakeven:    number;
  side:         Side;
  action:       Action;
  spot:         number;
}

function Row({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
      <span style={{ fontSize: 11, color: 'var(--text3)' }}>{label}</span>
      <span className="mono" style={{ fontSize: 11, color: color ?? 'var(--text)', fontWeight: bold ? 600 : 400 }}>{value}</span>
    </div>
  );
}

export const OrderSummary = React.memo(function OrderSummary({
  strike, expiry, size, market, totalPremium, fee, breakeven, side, action, spot,
}: Props) {
  const fmtP = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  const fmtU = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const collateralUsdc = side === 'call'
    ? size * (spot > 0 ? spot : strike)
    : size * strike;

  const isSell = action === 'sell';
  const netReceived = totalPremium - fee;

  return (
    <div style={{
      background: 'var(--bg2)', borderRadius: 8,
      border: '1px solid var(--border)', padding: '10px 12px',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Left accent bar */}
      <div style={{
        position: 'absolute', left: 0, top: '10%', bottom: '10%', width: 2,
        background: isSell ? 'var(--amber)' : (side === 'call' ? 'var(--green)' : 'var(--red)'),
        borderRadius: 1, opacity: 0.5,
      }} />

      <Row label="Strike" value={`$${fmtP(strike)}`} />
      <Row label="Expiry" value={expiry} />
      <Row label="Size"   value={`${size} ${market}`} />

      <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />

      {isSell ? (
        <>
          <Row label="Premium received" value={`$${fmtU(totalPremium)}`} color="var(--green)" />
          <Row label="Fee (5bps)"       value={`-$${fmtU(fee)}`}         color="var(--text3)" />
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <Row label="Net received" value={`$${fmtU(netReceived)}`} color="var(--cyan)" bold />
          {/* Collateral block */}
          <div style={{
            marginTop: 8, padding: '8px 10px', borderRadius: 6,
            background: 'rgba(236,202,90,0.06)',
            border: '1px solid rgba(236,202,90,0.15)',
          }}>
            <div style={{ fontSize: 9, color: 'var(--amber)', fontWeight: 600, marginBottom: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Collateral to lock
            </div>
            {side === 'call' ? (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: 'var(--text2)' }}>{size} {market}</span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 600 }}>≈ ${fmtU(collateralUsdc)}</span>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: 'var(--text2)' }}>{size} × ${fmtP(strike)}</span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 600 }}>${fmtU(collateralUsdc)}</span>
              </div>
            )}
          </div>
          <div style={{ marginTop: 4 }}>
            <Row label="Breakeven" value={`$${fmtP(breakeven)}`} color="var(--amber)" />
          </div>
        </>
      ) : (
        <>
          <Row label="Premium"    value={`$${fmtU(totalPremium)}`} color="var(--cyan)" />
          <Row label="Fee (5bps)" value={`$${fmtU(fee)}`}          color="var(--text3)" />
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <Row label="Total cost" value={`$${fmtU(totalPremium + fee)}`} color="var(--text)" bold />
          <Row label="Breakeven"  value={`$${fmtP(breakeven)}`} color="var(--amber)" />
        </>
      )}
    </div>
  );
});
