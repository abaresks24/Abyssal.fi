'use client';
import { useEffect, useRef, useState } from 'react';
import { pacificaClient, fetchLatestPrice } from '@/lib/pacificaClient';
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

// Shared cache across all hook instances
const _cache     = new Map<string, WSState>();
const _listeners = new Map<string, Set<(s: WSState) => void>>();

function notify(symbol: string, state: WSState) {
  _cache.set(symbol, state);
  _listeners.get(symbol)?.forEach((fn) => fn(state));
}

// ── WebSocket subscription (singleton) ──────────────────────────────────────
let _wsStarted = false;
function ensureWS() {
  if (_wsStarted) return;
  _wsStarted = true;
  pacificaClient.connect();
  pacificaClient.subscribePrices((items: PriceItem[]) => {
    for (const item of items) {
      const mark      = parseFloat(item.mark);
      const yesterday = parseFloat(item.yesterday_price);
      const change24h = yesterday > 0 ? ((mark - yesterday) / yesterday) * 100 : 0;
      notify(item.symbol, {
        price:       mark,
        bid:         mark * 0.9995,
        ask:         mark * 1.0005,
        change24h,
        timestamp:   item.timestamp ?? Date.now(),
        fundingRate: parseFloat(item.funding),
        isConnected: true,
      });
    }
  });
}

// ── REST polling per symbol (fallback when WS is blocked) ───────────────────
const _pollers    = new Map<string, ReturnType<typeof setInterval>>();
const _pollerRefs = new Map<string, number>();

function startPoller(symbol: string) {
  _pollerRefs.set(symbol, (_pollerRefs.get(symbol) ?? 0) + 1);
  if (_pollers.has(symbol)) return;

  const poll = async () => {
    try {
      const { price, change24h } = await fetchLatestPrice(symbol);
      if (price === 0) return;
      // Only use REST if WS hasn't sent fresh data in the last 10s
      const cached = _cache.get(symbol);
      if (!cached || cached.price === 0 || Date.now() - cached.timestamp > 10_000) {
        notify(symbol, {
          price, bid: price * 0.9995, ask: price * 1.0005,
          change24h, timestamp: Date.now(), fundingRate: 0, isConnected: false,
        });
      }
    } catch { /* silent */ }
  };

  poll(); // immediate on first mount
  _pollers.set(symbol, setInterval(poll, 15_000));
}

function stopPoller(symbol: string) {
  const count = (_pollerRefs.get(symbol) ?? 1) - 1;
  _pollerRefs.set(symbol, count);
  if (count <= 0) {
    const timer = _pollers.get(symbol);
    if (timer !== undefined) clearInterval(timer);
    _pollers.delete(symbol);
    _pollerRefs.delete(symbol);
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function usePacificaWS(market: string): WSState {
  const [state, setState] = useState<WSState>(() => _cache.get(market) ?? DEFAULT);
  const ref = useRef(setState);
  ref.current = setState;

  useEffect(() => {
    ensureWS();
    startPoller(market);

    if (!_listeners.has(market)) _listeners.set(market, new Set());
    const cb = (s: WSState) => ref.current(s);
    _listeners.get(market)!.add(cb);

    const cached = _cache.get(market);
    if (cached) setState(cached);

    return () => {
      _listeners.get(market)?.delete(cb);
      stopPoller(market);
    };
  }, [market]);

  return state;
}
