'use client';
import React, { useEffect, useRef, useState } from 'react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { pacificaClient } from '@/lib/pacificaClient';
import type { OrderBookData, OrderBookLevel } from '@/lib/pacificaClient';
import { usePacificaWS } from '@/hooks/usePacificaWS';
import { useOptionBuilder } from '@/hooks/useOptionBuilder';

type BookStatus = 'connecting' | 'live' | 'unavailable';

interface Level extends OrderBookLevel { total: number; }

function addTotals(levels: OrderBookLevel[]): Level[] {
  let cum = 0;
  return levels.map((l) => { cum += l.size; return { ...l, total: cum }; });
}

export function OrderBook() {
  const { market } = useOptionBuilder();
  const { price: spot } = usePacificaWS(market);
  const symbol = `${market}-PERP`;

  const [book, setBook] = useState<OrderBookData>({ bids: [], asks: [] });
  const [status, setStatus] = useState<BookStatus>('connecting');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setBook({ bids: [], asks: [] });
    setStatus('connecting');

    pacificaClient.connect();

    // Give Pacifica 5 s to deliver a snapshot; if nothing arrives → unavailable
    timeoutRef.current = setTimeout(() => setStatus('unavailable'), 5000);

    const unsub = pacificaClient.subscribeOrderBook(symbol, (data) => {
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
      setBook(data);
      setStatus('live');
    });

    return () => {
      unsub();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [symbol]);

  const bids = addTotals(book.bids.slice(0, 16));
  const asks = addTotals(book.asks.slice(0, 16));
  const maxTotal = Math.max(bids[bids.length - 1]?.total ?? 1, asks[asks.length - 1]?.total ?? 1);
  const mid = spot > 0 ? spot : 0;
  const spread = asks[0] && bids[0] ? asks[0].price - bids[0].price : 0;
  const spreadPct = mid > 0 && spread > 0 ? (spread / mid * 100).toFixed(3) : null;

  const fmt = (p: number) => {
    if (p >= 1000) return p.toFixed(1);
    if (p >= 10) return p.toFixed(2);
    return p.toFixed(4);
  };

  const row = (l: Level, side: 'bid' | 'ask') => {
    const color = side === 'bid' ? '#02c77b' : '#eb365a';
    const bg = side === 'bid' ? 'rgba(2,199,123,' : 'rgba(235,54,90,';
    const pct = (l.total / maxTotal) * 100;
    return (
      <div key={l.price} style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', padding: '1px 8px', fontSize: 11, fontFamily: 'monospace', cursor: 'default' }}>
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: `${pct}%`, background: `${bg}0.08)`, pointerEvents: 'none' }} />
        <span style={{ color, zIndex: 1, minWidth: 70 }}>{fmt(l.price)}</span>
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

      {status === 'connecting' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <LoadingSpinner size={28} />
          <span style={{ color: '#526a82', fontSize: 11 }}>Connecting…</span>
        </div>
      )}

      {status === 'unavailable' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <span style={{ color: '#526a82', fontSize: 11 }}>Order book unavailable</span>
          <span style={{ color: 'rgba(82,106,130,0.6)', fontSize: 10, textAlign: 'center', padding: '0 12px' }}>
            No live data from Pacifica WS
          </span>
          {mid > 0 && (
            <span style={{ color: '#55c3e9', fontFamily: 'monospace', fontWeight: 700, fontSize: 13, marginTop: 4 }}>
              {fmt(mid)}
            </span>
          )}
        </div>
      )}

      {status === 'live' && (
        <>
          {/* Asks (reversed so lowest ask nearest mid) */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column-reverse' }}>
            {asks.slice().reverse().map(l => row(l, 'ask'))}
          </div>

          {/* Mid + spread */}
          <div style={{ padding: '4px 8px', borderTop: '1px solid rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', flexShrink: 0, background: 'rgba(255,255,255,0.02)' }}>
            <span style={{ color: '#55c3e9', fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}>
              {mid > 0 ? fmt(mid) : '—'}
            </span>
            {spreadPct && (
              <span style={{ color: '#526a82', fontSize: 10, alignSelf: 'center' }}>Spread: {spreadPct}%</span>
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
