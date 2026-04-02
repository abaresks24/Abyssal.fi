'use client';
import { useEffect, useRef, useState } from 'react';

export interface BookLevel {
  price: number;
  size:  number;
  total: number;
}

export interface OrderBookState {
  bids:      BookLevel[];   // sorted best (index 0) → worst
  asks:      BookLevel[];   // sorted best (index 0) → worst
  spread:    number;        // ask_best - bid_best
  spreadPct: number;        // spread / mid * 100
  mid:       number;        // (bid_best + ask_best) / 2
  timestamp: number;
  loading:   boolean;
}

const EMPTY: OrderBookState = {
  bids: [], asks: [], spread: 0, spreadPct: 0, mid: 0, timestamp: 0, loading: true,
};

// Strip "-PERP" suffix: "BTC-PERP" → "BTC"
function toSymbol(market: string): string {
  return market.replace(/-PERP$/i, '');
}

function parseSide(raw: { p: string; a: string }[]): BookLevel[] {
  let cum = 0;
  return raw.map((item) => {
    const price = parseFloat(item.p);
    const size  = parseFloat(item.a);
    cum += size;
    return { price, size, total: cum };
  });
}

export function usePacificaOrderBook(market: string, intervalMs = 800): OrderBookState {
  const [state, setState] = useState<OrderBookState>(EMPTY);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setState(EMPTY);
    const sym = toSymbol(market);

    async function fetch_() {
      try {
        const res = await fetch(`/api/pacifica/v1/book?symbol=${sym}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!json.success || !json.data?.l) return;

        const [rawBids, rawAsks] = json.data.l as { p: string; a: string }[][];

        // l[0] = bids descending, l[1] = asks ascending
        const bids = parseSide(rawBids);
        const asks = parseSide(rawAsks);

        const bidBest = bids[0]?.price ?? 0;
        const askBest = asks[0]?.price ?? 0;
        const mid     = bidBest > 0 && askBest > 0 ? (bidBest + askBest) / 2 : 0;
        const spread  = askBest > 0 && bidBest > 0 ? askBest - bidBest : 0;
        const spreadPct = mid > 0 ? (spread / mid) * 100 : 0;

        setState({ bids, asks, spread, spreadPct, mid, timestamp: json.data.t ?? Date.now(), loading: false });
      } catch {
        // silent — keep last state
      }
    }

    fetch_();
    timerRef.current = setInterval(fetch_, intervalMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [market, intervalMs]);

  return state;
}
