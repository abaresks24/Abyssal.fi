'use client';
import React from 'react';
import { usePacificaWS } from '@/hooks/usePacificaWS';
import type { Market } from '@/types';

interface Props { market: Market; }

export function ChartHeader({ market }: Props) {
  const { price, change24h, bid, ask } = usePacificaWS(market);
  const isPos = change24h >= 0;

  const fmtPrice = (v: number) => market === 'SOL'
    ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : v.toLocaleString('en-US', { maximumFractionDigits: 0 });

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: '8px 14px',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
    }}>
      <div>
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{market}</span>
        <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 4 }}>Perp</span>
      </div>

      {price > 0 ? (
        <>
          <span className="mono" style={{ fontSize: 18, fontWeight: 500, color: 'var(--text)' }}>
            ${fmtPrice(price)}
          </span>
          <span className="mono" style={{ fontSize: 12, color: isPos ? 'var(--green)' : 'var(--red)' }}>
            {isPos ? '+' : ''}{change24h.toFixed(2)}%
          </span>
          <div style={{ display: 'flex', gap: 12, marginLeft: 4 }}>
            <div>
              <span style={{ fontSize: 10, color: 'var(--text3)' }}>Bid </span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--green)' }}>${fmtPrice(bid)}</span>
            </div>
            <div>
              <span style={{ fontSize: 10, color: 'var(--text3)' }}>Ask </span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--red)' }}>${fmtPrice(ask)}</span>
            </div>
          </div>
        </>
      ) : (
        <div className="skeleton" style={{ width: 140, height: 18 }} />
      )}
    </div>
  );
}
