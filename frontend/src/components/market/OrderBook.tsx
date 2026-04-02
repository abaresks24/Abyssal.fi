'use client';
import React from 'react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { usePacificaOrderBook, type BookLevel } from '@/hooks/usePacificaOrderBook';
import { useOptionBuilder } from '@/hooks/useOptionBuilder';

// ── Formatting ────────────────────────────────────────────────────────────────

function priceFmt(p: number): string {
  if (p >= 10_000) return p.toFixed(0);
  if (p >= 1_000)  return p.toFixed(1);
  if (p >= 10)     return p.toFixed(2);
  if (p >= 1)      return p.toFixed(3);
  return p.toFixed(4);
}

function sizeFmt(s: number): string {
  if (s >= 1_000) return s.toFixed(0);
  if (s >= 10)    return s.toFixed(2);
  return s.toFixed(3);
}

// ── Row ───────────────────────────────────────────────────────────────────────

function Row({ level, side, maxTotal }: { level: BookLevel; side: 'bid' | 'ask'; maxTotal: number }) {
  const color = side === 'bid' ? '#02c77b' : '#eb365a';
  const bg    = side === 'bid' ? 'rgba(2,199,123,' : 'rgba(235,54,90,';
  const pct   = maxTotal > 0 ? (level.total / maxTotal) * 100 : 0;

  return (
    <div style={{
      position: 'relative',
      display: 'flex',
      justifyContent: 'space-between',
      padding: '2.5px 8px',
      fontSize: 11,
      fontFamily: 'monospace',
      cursor: 'default',
    }}>
      {/* depth bar */}
      <div style={{
        position: 'absolute', right: 0, top: 1, bottom: 1,
        width: `${pct}%`,
        background: `${bg}0.22)`,
        pointerEvents: 'none',
      }} />
      <span style={{ color, zIndex: 1, minWidth: 70, fontWeight: 600 }}>{priceFmt(level.price)}</span>
      <span style={{ color: 'rgba(255,255,255,0.75)', zIndex: 1 }}>{sizeFmt(level.size)}</span>
      <span style={{ color: 'rgba(255,255,255,0.40)', zIndex: 1, minWidth: 54, textAlign: 'right' }}>
        {sizeFmt(level.total)}
      </span>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function OrderBook() {
  const { market } = useOptionBuilder();
  const { bids, asks, spread, spreadPct, mid, loading } = usePacificaOrderBook(market);

  const symbol = `${market}-PERP`;

  const maxTotal = Math.max(
    bids[bids.length - 1]?.total ?? 1,
    asks[asks.length - 1]?.total ?? 1,
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', fontSize: 11 }}>

      {/* Header */}
      <div style={{
        padding: '6px 8px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600, fontSize: 11 }}>Order Book</span>
        <span style={{ color: '#526a82', fontSize: 10 }}>{symbol}</span>
      </div>

      {/* Column headers */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        padding: '3px 8px', fontSize: 10, color: '#526a82',
        borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0,
      }}>
        <span>Price</span><span>Size</span><span>Total</span>
      </div>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <LoadingSpinner size={28} />
          <span style={{ color: '#526a82', fontSize: 11 }}>Loading…</span>
        </div>
      ) : (
        <>
          {/* Asks — furthest at top, closest at bottom flush against mid */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            {[...asks].reverse().map((l, i) => (
              <Row key={`ask-${i}`} level={l} side="ask" maxTotal={maxTotal} />
            ))}
          </div>

          {/* Mid + spread */}
          <div style={{
            padding: '4px 8px',
            borderTop: '1px solid rgba(255,255,255,0.04)',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexShrink: 0,
            background: 'rgba(255,255,255,0.02)',
          }}>
            <span style={{ color: '#55c3e9', fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}>
              {mid > 0 ? priceFmt(mid) : '—'}
            </span>
            {spreadPct > 0 && (
              <span style={{ color: '#526a82', fontSize: 10 }}>
                {priceFmt(spread)} ({spreadPct.toFixed(3)}%)
              </span>
            )}
          </div>

          {/* Bids — closest at top */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {bids.map((l, i) => (
              <Row key={`bid-${i}`} level={l} side="bid" maxTotal={maxTotal} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
