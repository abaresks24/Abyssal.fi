'use client';
import React, { useState } from 'react';
import { usePacificaWS } from '@/hooks/usePacificaWS';
import { useOptionBuilder } from '@/hooks/useOptionBuilder';
import type { Market } from '@/types';

const CATEGORIES: { label: string; icon: string; markets: Market[] }[] = [
  { label: 'Crypto',      icon: '◈', markets: ['BTC', 'ETH', 'SOL'] },
  { label: 'Equities',    icon: '◉', markets: ['NVDA', 'TSLA', 'PLTR', 'CRCL', 'HOOD', 'SP500'] },
  { label: 'Commodities', icon: '⬡', markets: ['XAU', 'XAG', 'PAXG', 'PLATINUM', 'NATGAS', 'COPPER'] },
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
  const [hover, setHover] = useState(false);
  const isSelected = market === selected;
  const isPos = change24h >= 0;

  return (
    <button
      onClick={() => setMarket(market)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        padding: '8px 12px',
        background: isSelected
          ? 'rgba(85,195,233,0.08)'
          : (hover ? 'rgba(255,255,255,0.02)' : 'transparent'),
        border: 'none',
        borderLeft: `2px solid ${isSelected ? 'var(--cyan)' : 'transparent'}`,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontWeight: 700, fontSize: 12,
          color: isSelected ? 'var(--cyan)' : (hover ? 'var(--text)' : 'var(--text)'),
          letterSpacing: '0.02em',
        }}>
          {market}
        </span>
        {isSelected && (
          <div style={{
            width: 4, height: 4, borderRadius: '50%',
            background: 'var(--cyan)',
            boxShadow: '0 0 6px var(--cyan-glow)',
          }} />
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
        <span className="mono" style={{ fontSize: 11, color: 'var(--text)' }}>
          {price > 0 ? `$${fmt(price, market)}` : '—'}
        </span>
        {price > 0 && (
          <span className="mono" style={{
            fontSize: 9,
            color: isPos ? 'var(--green)' : 'var(--red)',
            fontWeight: 600,
          }}>
            {isPos ? '+' : ''}{change24h.toFixed(2)}%
          </span>
        )}
      </div>
    </button>
  );
}

function CategorySection({ label, icon, markets }: { label: string; icon: string; markets: Market[] }) {
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
          padding: '8px 12px 5px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        <span style={{
          display: 'flex', alignItems: 'center', gap: 5,
          fontSize: 9, color: 'var(--text3)', letterSpacing: '0.08em',
          textTransform: 'uppercase', fontWeight: 600,
        }}>
          <span style={{ fontSize: 10, opacity: 0.6 }}>{icon}</span>
          {label}
        </span>
        <span style={{
          fontSize: 9, color: 'var(--text3)',
          transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
          transition: 'transform 0.2s ease',
          display: 'inline-block',
        }}>▾</span>
      </button>
      <div style={{
        maxHeight: open ? 500 : 0,
        overflow: 'hidden',
        transition: 'max-height 0.25s ease',
      }}>
        {markets.map((m) => <MarketRow key={m} market={m} />)}
      </div>
    </div>
  );
}

export function MarketSelector() {
  return (
    <div>
      <div style={{
        padding: '10px 12px 4px',
        fontSize: 10, color: 'var(--text3)',
        letterSpacing: '0.1em', textTransform: 'uppercase',
        fontWeight: 600,
      }}>
        Markets
      </div>
      {CATEGORIES.map(({ label, icon, markets }) => (
        <CategorySection key={label} label={label} icon={icon} markets={markets} />
      ))}
    </div>
  );
}
