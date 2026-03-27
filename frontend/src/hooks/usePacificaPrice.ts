'use client';
import { useState, useEffect, useCallback } from 'react';
import { pacificaWs } from '@/lib/pacifica_api';
import type { Market, CryptoMarket, PriceFeed } from '@/types';
export type { PriceFeed };

interface PriceState {
  prices: Record<CryptoMarket, number>;
  feeds: Record<CryptoMarket, PriceFeed | null>;
  loading: boolean;
  error: string | null;
}

const INITIAL_PRICES: Record<CryptoMarket, number> = { BTC: 0, ETH: 0, SOL: 0 };
const INITIAL_FEEDS: Record<CryptoMarket, PriceFeed | null> = { BTC: null, ETH: null, SOL: null };

/**
 * Real-time price hook for the three core crypto markets.
 * Keeps a WS connection alive and returns a prices record.
 */
export function usePacificaPrice(markets: CryptoMarket[] = ['BTC', 'ETH', 'SOL']) {
  const [state, setState] = useState<PriceState>({
    prices: { ...INITIAL_PRICES },
    feeds: { ...INITIAL_FEEDS },
    loading: true,
    error: null,
  });

  const handleTick = useCallback((feed: PriceFeed) => {
    setState((prev) => ({
      ...prev,
      loading: false,
      prices: { ...prev.prices, [feed.market]: feed.price },
      feeds: { ...prev.feeds, [feed.market]: feed },
    }));
  }, []);

  useEffect(() => {
    const unsubs = markets.map((m) => pacificaWs.subscribe(m, handleTick));
    pacificaWs.connect(markets);
    return () => {
      unsubs.forEach((fn) => fn());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    prices: state.prices,
    feeds: state.feeds,
    loading: state.loading,
    error: state.error,
    getPrice: (market: CryptoMarket) => state.prices[market] || 0,
  };
}

/**
 * Price hook for any Pacifica symbol (BTC, ETH, SOL, NVDA, XAU, ...).
 */
export function usePriceBySymbol(symbol: string) {
  const [price, setPrice] = useState(0);
  const [prevPrice, setPrevPrice] = useState(0);
  const [change24h, setChange24h] = useState(0);

  const handleTick = useCallback((feed: PriceFeed) => {
    setPrice((prev) => { setPrevPrice(prev); return feed.price; });
    setChange24h(feed.change24h);
  }, []);

  useEffect(() => {
    const unsub = pacificaWs.subscribe(symbol, handleTick);
    pacificaWs.connect();
    return unsub;
  }, [symbol, handleTick]);

  return {
    price,
    prevPrice,
    change24h,
    direction: price > prevPrice ? 'up' : price < prevPrice ? 'down' : ('neutral' as const),
  };
}

/** Convenience alias — accepts any Market or symbol string. */
export function useMarketPrice(market: string) {
  return usePriceBySymbol(market);
}
