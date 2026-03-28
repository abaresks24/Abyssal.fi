'use client';
import { useEffect, useRef, useState } from 'react';
import { pacificaClient } from '@/lib/pacificaClient';
import type { PriceItem } from '@/lib/pacificaClient';

export interface WSState {
  price: number;
  bid: number;
  ask: number;
  change24h: number;
  timestamp: number;
  fundingRate: number;
  isConnected: boolean;
}

const DEFAULT: WSState = {
  price: 0, bid: 0, ask: 0, change24h: 0,
  timestamp: 0, fundingRate: 0, isConnected: false,
};

// Shared cache: all symbols updated via one 'prices' subscription
const _cache = new Map<string, WSState>();
const _listeners = new Map<string, Set<(s: WSState) => void>>();

let _subscribed = false;

function ensureSubscribed() {
  if (_subscribed) return;
  _subscribed = true;
  pacificaClient.connect();

  pacificaClient.subscribePrices((items: PriceItem[]) => {
    for (const item of items) {
      const mark      = parseFloat(item.mark);
      const yesterday = parseFloat(item.yesterday_price);
      const change24h = yesterday > 0 ? ((mark - yesterday) / yesterday) * 100 : 0;
      const spread    = mark * 0.0005;

      const state: WSState = {
        price:       mark,
        bid:         mark - spread,
        ask:         mark + spread,
        change24h,
        timestamp:   item.timestamp,
        fundingRate: parseFloat(item.funding),
        isConnected: true,
      };

      _cache.set(item.symbol, state);
      _listeners.get(item.symbol)?.forEach((fn) => fn(state));
    }
  });
}

export function usePacificaWS(market: string): WSState {
  const [state, setState] = useState<WSState>(() => _cache.get(market) ?? DEFAULT);
  const ref = useRef(setState);
  ref.current = setState;

  useEffect(() => {
    ensureSubscribed();

    // Register listener
    if (!_listeners.has(market)) _listeners.set(market, new Set());
    const cb = (s: WSState) => ref.current(s);
    _listeners.get(market)!.add(cb);

    // Seed from cache if available
    const cached = _cache.get(market);
    if (cached) setState(cached);

    return () => {
      _listeners.get(market)?.delete(cb);
    };
  }, [market]);

  return state;
}
