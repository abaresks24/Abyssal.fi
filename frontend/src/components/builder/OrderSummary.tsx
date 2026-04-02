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

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
      <span style={{ fontSize: 11, color: 'var(--text3)' }}>{label}</span>
      <span className="mono" style={{ fontSize: 11, color: color ?? 'var(--text)' }}>{value}</span>
    </div>
  );
}

export const OrderSummary = React.memo(function OrderSummary({
  strike, expiry, size, market, totalPremium, fee, breakeven, side, action, spot,
}: Props) {
  const fmtP = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  const fmtU = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Collateral for sell:
  //   Sell Call → lock size × spot (BTC equiv in USDC)
  //   Sell Put  → lock size × strike (USDC)
  const collateralUsdc = side === 'call'
    ? size * (spot > 0 ? spot : strike)
    : size * strike;

  const isSell = action === 'sell';
  const netReceived = totalPremium - fee;

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
      <Row label="Strike" value={`$${fmtP(strike)}`} />
      <Row label="Expiry" value={expiry} />
      <Row label="Size"   value={`${size} ${market}`} />

      {isSell ? (
        <>
          <Row label="Premium received" value={`$${fmtU(totalPremium)}`} color="var(--green)" />
          <Row label="Fee (5bps)"       value={`-$${fmtU(fee)}`}         color="var(--text2)" />
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <Row
            label="Net received"
            value={`$${fmtU(netReceived)}`}
            color="var(--cyan)"
          />
          {/* Collateral block */}
          <div style={{
            marginTop: 6,
            padding: '6px 8px',
            borderRadius: 4,
            background: 'rgba(236,202,90,0.08)',
            border: '1px solid rgba(236,202,90,0.18)',
          }}>
            <div style={{ fontSize: 10, color: 'var(--amber)', fontWeight: 600, marginBottom: 3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Collateral to lock
            </div>
            {side === 'call' ? (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: 'var(--text2)' }}>{size} {market}</span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--amber)' }}>≈ ${fmtU(collateralUsdc)}</span>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: 'var(--text2)' }}>{size} × ${fmtP(strike)}</span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--amber)' }}>${fmtU(collateralUsdc)}</span>
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
          <Row label="Fee (5bps)" value={`$${fmtU(fee)}`}          color="var(--text2)" />
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <Row label="Total cost" value={`$${fmtU(totalPremium + fee)}`} color="var(--text)" />
          <Row label="Breakeven"  value={`$${fmtP(breakeven)}`}          color="var(--amber)" />
        </>
      )}
    </div>
  );
});
