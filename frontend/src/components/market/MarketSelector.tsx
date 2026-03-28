'use client';
import React, { useState } from 'react';
import { usePacificaWS } from '@/hooks/usePacificaWS';
import { useOptionBuilder } from '@/hooks/useOptionBuilder';
import type { Market } from '@/types';

const CATEGORIES: { label: string; markets: Market[] }[] = [
  { label: 'Crypto',      markets: ['BTC', 'ETH', 'SOL'] },
  { label: 'Equities',    markets: ['NVDA', 'TSLA', 'PLTR', 'CRCL', 'HOOD', 'SP500'] },
  { label: 'Commodities', markets: ['XAU', 'XAG', 'PAXG', 'PLATINUM', 'NATGAS', 'COPPER'] },
];

const DECIMAL_OVERRIDE: Partial<Record<Market, number>> = {
  SOL: 2, NATGAS: 3, XAG: 2, COPPER: 3,
};

function fmt(price: number, market: Market): string {
  const dec = DECIMAL_OVERRIDE[market] ?? (price < 10 ? 4 : price < 1000 ? 2 : 0);
  return price.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function MarketRow({ market }: { market: Market }) {
  const { market: selected, setMarket } = useOptionBuilder();
  const { price, change24h } = usePacificaWS(market);
  const isSelected = market === selected;
  const isPos = change24h >= 0;

  return (
    <button
      onClick={() => setMarket(market)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        padding: '7px 12px',
        background: isSelected ? 'var(--bg3)' : 'transparent',
        border: 'none',
        borderLeft: `2px solid ${isSelected ? 'var(--cyan)' : 'transparent'}`,
        cursor: 'pointer',
      }}
    >
      <span style={{ fontWeight: 600, fontSize: 12, color: isSelected ? 'var(--cyan)' : 'var(--text)' }}>
        {market}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
        <span className="mono" style={{ fontSize: 11, color: 'var(--text)' }}>
          {price > 0 ? `$${fmt(price, market)}` : '—'}
        </span>
        {price > 0 && (
          <span className="mono" style={{ fontSize: 9, color: isPos ? 'var(--green)' : 'var(--red)' }}>
            {isPos ? '+' : ''}{change24h.toFixed(2)}%
          </span>
        )}
      </div>
    </button>
  );
}

function CategorySection({ label, markets }: { label: string; markets: Market[] }) {
  const [open, setOpen] = useState(true);

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '6px 12px 4px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 9, color: 'var(--text3)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
          {label}
        </span>
        <span style={{ fontSize: 9, color: 'var(--text3)' }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && markets.map((m) => <MarketRow key={m} market={m} />)}
    </div>
  );
}

export function MarketSelector() {
  return (
    <div>
      <div style={{ padding: '8px 12px 4px', fontSize: 10, color: 'var(--text3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        Markets
      </div>
      {CATEGORIES.map(({ label, markets }) => (
        <CategorySection key={label} label={label} markets={markets} />
      ))}
    </div>
  );
}
