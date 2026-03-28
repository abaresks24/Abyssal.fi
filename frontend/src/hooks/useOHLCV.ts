'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchKlines, pacificaClient } from '@/lib/pacificaClient';
import type { Candle } from '@/types';

const INITIAL_LIMIT  = 300;
const LOADMORE_LIMIT = 500;

export function useOHLCV(market: string, interval = '1h') {
  const [candles,       setCandles]       = useState<Candle[]>([]);
  const [isLoading,     setIsLoading]     = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const hasMoreRef = useRef(true);

  // ── Initial fetch ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setCandles([]);
    hasMoreRef.current = true;

    fetchKlines(market, interval, INITIAL_LIMIT).then((data) => {
      if (cancelled) return;
      setCandles(data);
      setIsLoading(false);
      if (data.length < INITIAL_LIMIT) hasMoreRef.current = false;
    });

    return () => { cancelled = true; };
  }, [market, interval]);

  // ── Load older candles ─────────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMoreRef.current) return;
    setIsLoadingMore(true);

    setCandles((prev) => {
      if (prev.length === 0) { setIsLoadingMore(false); return prev; }
      const oldest = prev[0].timestamp;

      fetchKlines(market, interval, LOADMORE_LIMIT, oldest - 1).then((older) => {
        setIsLoadingMore(false);
        if (older.length === 0) {
          hasMoreRef.current = false;
          return;
        }
        if (older.length < LOADMORE_LIMIT) hasMoreRef.current = false;
        setCandles((cur) => {
          // Deduplicate + sort
          const map = new Map<number, Candle>();
          [...older, ...cur].forEach(c => map.set(c.timestamp, c));
          return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
        });
      });

      return prev; // no change yet
    });
  }, [market, interval, isLoadingMore]);

  // ── Live WebSocket updates ─────────────────────────────────────────────
  useEffect(() => {
    pacificaClient.connect();
    const unsub = pacificaClient.subscribeCandle(market, interval, (incoming) => {
      setCandles((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        if (incoming.timestamp === last.timestamp) {
          return [...prev.slice(0, -1), {
            ...last,
            high:   Math.max(last.high, incoming.high),
            low:    Math.min(last.low,  incoming.low),
            close:  incoming.close,
            volume: incoming.volume,
          }];
        }
        if (incoming.timestamp > last.timestamp) return [...prev, incoming];
        return prev;
      });
    });
    return () => unsub();
  }, [market, interval]);

  return { candles, isLoading, isLoadingMore, loadMore };
}
