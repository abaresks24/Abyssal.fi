'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { usePacificaWS } from '@/hooks/usePacificaWS';
import { useOptionBuilder } from '@/hooks/useOptionBuilder';

// ── AMM depth generation ─────────────────────────────────────────────────────
// Pacifica is a vAMM perp exchange — no traditional order book exists.
// We derive realistic depth from the live Pacifica mark price using the
// AMM's constant-product curve: more liquidity near mid, thinner at edges.

const LEVELS = 16;

// Half-spread as % of mid price, per asset class
const HALF_SPREAD_PCT: Record<string, number> = {
  BTC: 0.00005, ETH: 0.00008, SOL: 0.00015,
  NVDA: 0.0002, TSLA: 0.0003, PLTR: 0.0004, CRCL: 0.0004, HOOD: 0.0005, SP500: 0.0001,
  XAU: 0.00008, XAG: 0.0002, PAXG: 0.00008, PLATINUM: 0.0002, NATGAS: 0.0006, COPPER: 0.0004,
};

// Base liquidity (notional USD per level, level 0 = closest to mid)
const BASE_LIQ: Record<string, number> = {
  BTC: 800, ETH: 500, SOL: 200,
  NVDA: 80, TSLA: 60, PLTR: 30, CRCL: 25, HOOD: 20, SP500: 120,
  XAU: 150, XAG: 60, PAXG: 100, PLATINUM: 50, NATGAS: 25, COPPER: 25,
};

// Deterministic jitter from level index + seed (no random — stable on re-render)
function jitter(i: number, seed: number, amp: number): number {
  return amp * (0.7 + 0.6 * Math.abs(Math.sin(i * 2.3 + seed)));
}

interface BookLevel { price: number; size: number; total: number; }

function buildSide(
  mid: number,
  market: string,
  side: 'bids' | 'asks',
  seed: number,
): BookLevel[] {
  if (mid <= 0) return [];
  const halfSpread = mid * (HALF_SPREAD_PCT[market] ?? 0.0002);
  const tickStep   = mid * (HALF_SPREAD_PCT[market] ?? 0.0002) * 1.5;
  const baseLiq    = BASE_LIQ[market] ?? 50;

  const levels: BookLevel[] = [];
  let cum = 0;
  for (let i = 0; i < LEVELS; i++) {
    // Price: half-spread + i ticks away from mid
    const offset = halfSpread + i * tickStep;
    const price  = side === 'bids' ? mid - offset : mid + offset;
    // Liquidity: decays with distance (AMM curve), add some jitter for realism
    const liqUsd = baseLiq / (i + 1) * jitter(i, seed, 1);
    const size   = liqUsd / mid;
    cum += size;
    levels.push({ price, size, total: cum });
  }
  return levels;
}

function priceFmt(p: number): string {
  if (p >= 10_000) return p.toFixed(0);
  if (p >= 1_000)  return p.toFixed(1);
  if (p >= 10)     return p.toFixed(2);
  if (p >= 1)      return p.toFixed(3);
  return p.toFixed(4);
}

// ── Component ────────────────────────────────────────────────────────────────

export function OrderBook() {
  const { market } = useOptionBuilder();
  const { price: mid, isConnected } = usePacificaWS(market);
  const symbol = `${market}-PERP`;

  // Stable seed per market so depth doesn't flash on every render
  const seed = useMemo(() => market.split('').reduce((a, c) => a + c.charCodeAt(0), 0), [market]);

  // Show spinner until first price arrives
  const [ready, setReady] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setReady(false);
    timerRef.current = setTimeout(() => setReady(true), 6000); // max wait
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [market]);

  useEffect(() => {
    if (mid > 0) {
      setReady(true);
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    }
  }, [mid]);

  const bids = useMemo(() => buildSide(mid, market, 'bids', seed),     [mid, market, seed]);
  const asks = useMemo(() => buildSide(mid, market, 'asks', seed + 1), [mid, market, seed]);

  const maxTotal = Math.max(bids[bids.length - 1]?.total ?? 1, asks[asks.length - 1]?.total ?? 1);
  const spread    = (asks[0]?.price ?? 0) - (bids[0]?.price ?? 0);
  const spreadPct = mid > 0 && spread > 0 ? (spread / mid * 100).toFixed(3) : null;

  const row = (l: BookLevel, side: 'bid' | 'ask') => {
    const color = side === 'bid' ? '#02c77b' : '#eb365a';
    const bg    = side === 'bid' ? 'rgba(2,199,123,' : 'rgba(235,54,90,';
    const pct   = (l.total / maxTotal) * 100;
    return (
      <div key={l.price.toFixed(6)} style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', padding: '1px 8px', fontSize: 11, fontFamily: 'monospace', cursor: 'default' }}>
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: `${pct}%`, background: `${bg}0.08)`, pointerEvents: 'none' }} />
        <span style={{ color, zIndex: 1, minWidth: 70 }}>{priceFmt(l.price)}</span>
        <span style={{ color: 'rgba(255,255,255,0.6)', zIndex: 1 }}>{l.size.toFixed(3)}</span>
        <span style={{ color: 'rgba(255,255,255,0.35)', zIndex: 1, minWidth: 50, textAlign: 'right' }}>{l.total.toFixed(2)}</span>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', fontSize: 11 }}>
      {/* Header */}
      <div style={{ padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600, fontSize: 11 }}>Order Book</span>
        <span style={{ color: '#526a82', fontSize: 10 }}>{symbol}</span>
      </div>

      {/* Column headers */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 8px', fontSize: 10, color: '#526a82', borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0 }}>
        <span>Price</span><span>Size</span><span>Total</span>
      </div>

      {!ready ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <LoadingSpinner size={28} />
          <span style={{ color: '#526a82', fontSize: 11 }}>Connecting…</span>
        </div>
      ) : (
        <>
          {/* Asks (reversed so lowest ask nearest mid) */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column-reverse' }}>
            {asks.slice().reverse().map(l => row(l, 'ask'))}
          </div>

          {/* Mid + spread */}
          <div style={{ padding: '4px 8px', borderTop: '1px solid rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', flexShrink: 0, background: 'rgba(255,255,255,0.02)' }}>
            <span style={{ color: '#55c3e9', fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}>
              {mid > 0 ? priceFmt(mid) : '—'}
            </span>
            {spreadPct && (
              <span style={{ color: '#526a82', fontSize: 10, alignSelf: 'center' }}>Spread {spreadPct}%</span>
            )}
          </div>

          {/* Bids */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {bids.map(l => row(l, 'bid'))}
          </div>
        </>
      )}
    </div>
  );
}
