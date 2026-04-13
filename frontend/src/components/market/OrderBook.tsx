'use client';
import React from 'react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { usePacificaOrderBook, type BookLevel } from '@/hooks/usePacificaOrderBook';
import { useOptionBuilder } from '@/hooks/useOptionBuilder';

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

function Row({ level, side, maxTotal }: { level: BookLevel; side: 'bid' | 'ask'; maxTotal: number }) {
  const isBid = side === 'bid';
  const color = isBid ? '#02c77b' : '#eb365a';
  const bgRaw = isBid ? '2,199,123' : '235,54,90';
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
      transition: 'background 0.1s',
    }}>
      {/* Depth bar with gradient fade */}
      <div style={{
        position: 'absolute',
        right: 0, top: 0, bottom: 0,
        width: `${pct}%`,
        background: `linear-gradient(${isBid ? '90deg' : '270deg'}, rgba(${bgRaw},0.18), rgba(${bgRaw},0.04))`,
        pointerEvents: 'none',
        transition: 'width 0.3s ease',
      }} />
      <span style={{ color, zIndex: 1, minWidth: 70, fontWeight: 600 }}>{priceFmt(level.price)}</span>
      <span style={{ color: 'rgba(255,255,255,0.7)', zIndex: 1 }}>{sizeFmt(level.size)}</span>
      <span style={{ color: 'rgba(255,255,255,0.35)', zIndex: 1, minWidth: 54, textAlign: 'right' }}>
        {sizeFmt(level.total)}
      </span>
    </div>
  );
}

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
        padding: '7px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: 11, letterSpacing: '0.02em' }}>
          Order Book
        </span>
        <span style={{
          color: 'var(--text3)', fontSize: 9,
          padding: '1px 6px', background: 'var(--bg3)',
          borderRadius: 3, letterSpacing: '0.04em',
        }}>{symbol}</span>
      </div>

      {/* Column headers */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        padding: '4px 8px', fontSize: 9, color: 'var(--text3)',
        borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0,
        letterSpacing: '0.06em', textTransform: 'uppercase',
      }}>
        <span>Price</span><span>Size</span><span>Total</span>
      </div>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <LoadingSpinner size={28} />
          <span style={{ color: 'var(--text3)', fontSize: 11 }}>Loading…</span>
        </div>
      ) : (
        <>
          {/* Asks */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            {[...asks].reverse().map((l, i) => (
              <Row key={`ask-${i}`} level={l} side="ask" maxTotal={maxTotal} />
            ))}
          </div>

          {/* Mid + spread — the hero row */}
          <div style={{
            padding: '6px 10px',
            borderTop: '1px solid rgba(255,255,255,0.04)',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexShrink: 0,
            background: 'linear-gradient(90deg, rgba(85,195,233,0.04), transparent)',
          }}>
            <span style={{
              color: 'var(--cyan)', fontFamily: 'monospace', fontWeight: 700, fontSize: 14,
              textShadow: '0 0 12px rgba(85,195,233,0.2)',
              letterSpacing: '-0.01em',
            }}>
              {mid > 0 ? priceFmt(mid) : '—'}
            </span>
            {spreadPct > 0 && (
              <span style={{
                color: 'var(--text3)', fontSize: 9,
                padding: '1px 5px', background: 'var(--bg3)',
                borderRadius: 3,
              }}>
                {priceFmt(spread)} ({spreadPct.toFixed(3)}%)
              </span>
            )}
          </div>

          {/* Bids */}
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
