'use client';
import { useEffect, useState } from 'react';
import { fetchKlines, pacificaClient } from '@/lib/pacificaClient';
import type { Candle } from '@/types';

export function useOHLCV(market: string, interval = '1h') {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch 200 historical candles on mount / market change
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setCandles([]);

    fetchKlines(market, interval, 200).then((data) => {
      if (cancelled) return;
      if (data.length > 0) setCandles(data);
      setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, [market, interval]);

  // Live WS: update current candle or append a new one
  useEffect(() => {
    pacificaClient.connect();

    const unsub = pacificaClient.subscribeCandle(market, interval, (incoming) => {
      setCandles((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];

        if (incoming.timestamp === last.timestamp) {
          const updated: Candle = {
            timestamp: last.timestamp,
            open:   last.open,
            high:   Math.max(last.high, incoming.high),
            low:    Math.min(last.low,  incoming.low),
            close:  incoming.close,
            volume: incoming.volume,
          };
          return [...prev.slice(0, -1), updated];
        } else if (incoming.timestamp > last.timestamp) {
          return [...prev, incoming];
        }
        return prev;
      });
    });

    return () => unsub();
  }, [market, interval]);

  const lastCandle = candles[candles.length - 1] ?? null;
  return { candles, isLoading, lastCandle };
}
