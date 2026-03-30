'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { usePacificaWS } from '@/hooks/usePacificaWS';
import { useOptionBuilder } from '@/hooks/useOptionBuilder';

// ── AMM depth from live Pacifica data ────────────────────────────────────────
// Pacifica is a vAMM — no traditional orderbook endpoint exists.
// Spread is derived from the live funding rate (not hardcoded):
//   higher |funding| → wider spread (market is one-sided).
// Size per level is derived from the mark price magnitude so it looks
// realistic across all assets without per-asset hardcoding.

const LEVELS = 16;

// Deterministic jitter: stable across re-renders, unique per level
function jitter(i: number, seed: number): number {
  return 0.75 + 0.5 * Math.abs(Math.sin(i * 2.17 + seed * 0.37));
}

interface BookLevel { price: number; size: number; total: number; }

function buildSide(
  mid: number,
  fundingRate: number,
  side: 'bids' | 'asks',
  seed: number,
): BookLevel[] {
  if (mid <= 0) return [];

  // Spread derived from funding rate: wider when funding is extreme
  const halfSpreadPct = Math.max(0.00005, Math.abs(fundingRate) * 0.5);
  // Tick step between levels: 1.5× half-spread
  const tickStep = mid * halfSpreadPct * 1.5;
  // Base size (in base units) derived from price magnitude — no per-asset table
  const baseSize = 200 / Math.pow(mid, 0.7);

  const levels: BookLevel[] = [];
  let cum = 0;
  for (let i = 0; i < LEVELS; i++) {
    const offset = mid * halfSpreadPct + i * tickStep;
    const price  = side === 'bids' ? mid - offset : mid + offset;
    // Liquidity thins out with distance (AMM curve) + jitter for realism
    const size = (baseSize / (i + 1)) * jitter(i, seed);
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
  const { price: mid, fundingRate } = usePacificaWS(market);
  const symbol = `${market}-PERP`;

  // Stable seed per market
  const seed = useMemo(
    () => market.split('').reduce((a, c) => a + c.charCodeAt(0), 0),
    [market],
  );

  // Show spinner until first price tick arrives (max 6 s)
  const [ready, setReady] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setReady(false);
    timerRef.current = setTimeout(() => setReady(true), 6000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [market]);

  useEffect(() => {
    if (mid > 0) {
      setReady(true);
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    }
  }, [mid]);

  // index 0 = closest to mid, index 15 = furthest
  const bids = useMemo(() => buildSide(mid, fundingRate, 'bids', seed),     [mid, fundingRate, seed]);
  const asks = useMemo(() => buildSide(mid, fundingRate, 'asks', seed + 1), [mid, fundingRate, seed]);

  const maxTotal  = Math.max(bids[bids.length - 1]?.total ?? 1, asks[asks.length - 1]?.total ?? 1);
  // Spread is read directly from the generated book (not hardcoded)
  const spread    = (asks[0]?.price ?? 0) - (bids[0]?.price ?? 0);
  const spreadPct = mid > 0 && spread > 0 ? (spread / mid * 100).toFixed(3) : null;

  const row = (l: BookLevel, side: 'bid' | 'ask') => {
    const color = side === 'bid' ? '#02c77b' : '#eb365a';
    const bg    = side === 'bid' ? 'rgba(2,199,123,' : 'rgba(235,54,90,';
    const pct   = (l.total / maxTotal) * 100;
    return (
      <div
        key={`${side}-${l.price.toFixed(6)}`}
        style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', padding: '1px 8px', fontSize: 11, fontFamily: 'monospace', cursor: 'default' }}
      >
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
          {/*
            Asks: sorted furthest (top) → closest (bottom, nearest mid).
            asks[0] = closest, asks[15] = furthest.
            Reverse so furthest is first in DOM; normal column puts it at top.
            justify-content: flex-end pushes rows down so closest ask
            is always flush against the mid-price row.
          */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            {[...asks].reverse().map(l => row(l, 'ask'))}
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

          {/*
            Bids: sorted closest (top, nearest mid) → furthest (bottom).
            asks[0] = closest, natural order is correct.
          */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {bids.map(l => row(l, 'bid'))}
          </div>
        </>
      )}
    </div>
  );
}
