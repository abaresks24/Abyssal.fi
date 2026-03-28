'use client';
import React from 'react';
import { usePacificaWS } from '@/hooks/usePacificaWS';
import type { Market } from '@/types';

const MARKETS: Market[] = ['BTC', 'ETH', 'SOL'];

function TickerItem({ market }: { market: Market }) {
  const { price, change24h } = usePacificaWS(market);
  const isPos = change24h >= 0;
  const fmt = market === 'SOL'
    ? price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : price.toLocaleString('en-US', { maximumFractionDigits: 0 });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', borderRight: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text3)', fontSize: 11 }}>{market}</span>
      <span className="mono" style={{ fontSize: 11, color: 'var(--text)' }}>
        {price > 0 ? `$${fmt}` : <span className="skeleton" style={{ width: 60, height: 10, display: 'inline-block' }} />}
      </span>
      {price > 0 && (
        <span className="mono" style={{ fontSize: 10, color: isPos ? 'var(--green)' : 'var(--red)' }}>
          {isPos ? '+' : ''}{change24h.toFixed(2)}%
        </span>
      )}
    </div>
  );
}

export const TickerBar = React.memo(function TickerBar() {
  return (
    <div style={{
      height: 32,
      background: 'var(--bg1)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      flexShrink: 0,
    }}>
      {MARKETS.map((m) => <TickerItem key={m} market={m} />)}
      <div style={{ flex: 1 }} />
      <div style={{ padding: '0 12px', fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
        Options · European · Cash-settled USDC
      </div>
    </div>
  );
});
