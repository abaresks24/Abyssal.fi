'use client';
import React, { useMemo, useState } from 'react';
import { usePacificaWS } from '@/hooks/usePacificaWS';
import { useOptionBuilder } from '@/hooks/useOptionBuilder';

// Tick sizes per market
const TICK: Record<string, number> = {
  BTC: 10, ETH: 1, SOL: 0.05, NVDA: 0.5, TSLA: 0.5, PLTR: 0.1,
  CRCL: 0.1, HOOD: 0.1, SP500: 5, XAU: 0.5, XAG: 0.05,
  PAXG: 0.5, PLATINUM: 0.5, NATGAS: 0.005, COPPER: 0.005,
};

interface Level { price: number; size: number; total: number; }

function buildBook(mid: number, market: string, seed: number): { bids: Level[]; asks: Level[] } {
  const tick = TICK[market] ?? 1;
  const levels = 16;
  const rng = (s: number) => { const x = Math.sin(s) * 10000; return x - Math.floor(x); };

  const bids: Level[] = [];
  const asks: Level[] = [];
  let bidTotal = 0, askTotal = 0;

  for (let i = 1; i <= levels; i++) {
    const bSize = Math.round((rng(seed + i) * 8 + 0.5) * Math.pow(0.88, i - 1) * 100) / 100;
    const aSize = Math.round((rng(seed + i + 100) * 8 + 0.5) * Math.pow(0.88, i - 1) * 100) / 100;
    bidTotal += bSize;
    askTotal += aSize;
    bids.push({ price: mid - i * tick, size: bSize, total: bidTotal });
    asks.push({ price: mid + i * tick, size: aSize, total: askTotal });
  }
  return { bids, asks };
}

export function OrderBook() {
  const { market } = useOptionBuilder();
  const { price } = usePacificaWS(market);
  const [priceBase] = useState(() => Math.floor(Date.now() / 5000));
  const mid = price > 0 ? price : 0;
  const tick = TICK[market] ?? 1;

  const { bids, asks } = useMemo(() => {
    if (mid <= 0) return { bids: [], asks: [] };
    return buildBook(mid, market, priceBase + Math.floor(mid / (tick * 5)));
  }, [mid, market, priceBase, tick]);

  const maxTotal = Math.max(bids[bids.length - 1]?.total ?? 1, asks[asks.length - 1]?.total ?? 1);
  const spread = asks[0] && bids[0] ? asks[0].price - bids[0].price : 0;
  const spreadPct = mid > 0 ? (spread / mid * 100).toFixed(3) : '0.000';

  const fmt = (p: number) => {
    if (p >= 1000) return p.toFixed(1);
    if (p >= 10)   return p.toFixed(2);
    return p.toFixed(4);
  };

  const row = (l: Level, side: 'bid' | 'ask') => {
    const color = side === 'bid' ? '#02c77b' : '#eb365a';
    const bg    = side === 'bid' ? 'rgba(2,199,123,' : 'rgba(235,54,90,';
    const pct   = (l.total / maxTotal) * 100;
    return (
      <div key={l.price} style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', padding: '1px 8px', fontSize: 11, fontFamily: 'monospace', cursor: 'default' }}>
        {/* depth bar */}
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: `${pct}%`, background: bg + '0.08)', pointerEvents: 'none' }}/>
        <span style={{ color, zIndex: 1, minWidth: 70 }}>{fmt(l.price)}</span>
        <span style={{ color: 'rgba(255,255,255,0.6)', zIndex: 1 }}>{l.size.toFixed(3)}</span>
        <span style={{ color: 'rgba(255,255,255,0.35)', zIndex: 1, minWidth: 50, textAlign: 'right' }}>{l.total.toFixed(2)}</span>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', fontSize: 11 }}>
      {/* Header */}
      <div style={{ padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
        <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600, fontSize: 11 }}>Order Book</span>
        <span style={{ float: 'right', color: '#526a82', fontSize: 10 }}>{market}-PERP</span>
      </div>
      {/* Column headers */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 8px', fontSize: 10, color: '#526a82', borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0 }}>
        <span>Price</span><span>Size</span><span>Total</span>
      </div>
      {/* Asks (reversed so lowest ask is at bottom of asks section) */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column-reverse' }}>
        {asks.slice().reverse().map(l => row(l, 'ask'))}
      </div>
      {/* Mid price + spread */}
      <div style={{ padding: '4px 8px', borderTop: '1px solid rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', flexShrink: 0, background: 'rgba(255,255,255,0.02)' }}>
        <span style={{ color: '#55c3e9', fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}>{mid > 0 ? fmt(mid) : '—'}</span>
        <span style={{ color: '#526a82', fontSize: 10, alignSelf: 'center' }}>Spread: {spreadPct}%</span>
      </div>
      {/* Bids */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {bids.map(l => row(l, 'bid'))}
      </div>
    </div>
  );
}
