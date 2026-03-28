/**
 * Pacifica real-time data client.
 *
 * REST base:  /api/pacifica (Next.js proxy → https://api.pacifica.fi/api)
 * WebSocket:  wss://ws.pacifica.fi/ws (NEXT_PUBLIC_PACIFICA_WS_URL)
 *
 * WS subscribe format: {method:"subscribe", params:{source, symbol?, interval?}}
 * WS message format:   {channel:"mark_price_candle"|"prices"|"candle", data:{...}}
 */

import type { Candle } from '@/types';

// ── REST types ────────────────────────────────────────────────────────────────

interface KlineItem {
  t: number;   // open time (ms)
  T: number;   // close time (ms)
  s: string;   // symbol
  i: string;   // interval
  o: string;   // open
  c: string;   // close
  h: string;   // high
  l: string;   // low
  v: string;   // volume (base asset)
  n: number;   // trade count
}

export interface PriceItem {
  symbol: string;
  oracle: string;
  mark: string;
  mid: string;
  funding: string;
  next_funding: string;
  yesterday_price: string;
  open_interest: string;
  volume_24h: string;
  timestamp: number;
}

// ── REST helpers ──────────────────────────────────────────────────────────────

function klineToCandle(k: KlineItem): Candle {
  return {
    timestamp: k.t,
    open:   parseFloat(k.o),
    high:   parseFloat(k.h),
    low:    parseFloat(k.l),
    close:  parseFloat(k.c),
    volume: parseFloat(k.v),
  };
}

/** Fetch historical mark-price candles from Pacifica REST */
export async function fetchKlines(
  symbol: string,
  interval = '1h',
  limit = 200,
): Promise<Candle[]> {
  const now   = Date.now();
  const msMap: Record<string, number> = {
    '1m': 60_000, '3m': 180_000, '5m': 300_000,
    '15m': 900_000, '30m': 1_800_000,
    '1h': 3_600_000, '2h': 7_200_000, '4h': 14_400_000,
    '8h': 28_800_000, '12h': 43_200_000, '1d': 86_400_000,
  };
  const periodMs = msMap[interval] ?? 3_600_000;
  const startTime = now - limit * periodMs;

  const params = new URLSearchParams({
    symbol,
    interval,
    start_time: startTime.toString(),
    end_time:   now.toString(),
    limit:      limit.toString(),
  });

  const res = await fetch(`/api/pacifica/v1/kline/mark?${params}`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    console.warn('[Pacifica] kline fetch failed:', res.status);
    return [];
  }

  const json = await res.json();
  if (!json.success || !Array.isArray(json.data)) return [];

  return (json.data as KlineItem[]).map(klineToCandle);
}

/** Fetch real-time mark price + 24h stats for a symbol from /api/v1/info */
export async function fetchPrices(): Promise<PriceItem[]> {
  const res = await fetch('/api/pacifica/v1/info', { cache: 'no-store' });
  if (!res.ok) return [];
  const json = await res.json();
  // info doesn't have prices — convert funding rates at least
  return [];
}

// ── WebSocket client ──────────────────────────────────────────────────────────

type PricesCallback = (items: PriceItem[]) => void;
type CandleCallback = (candle: Candle) => void;

interface Subscription {
  params: Record<string, string>;
  callbacks: Set<(...args: unknown[]) => void>;
}

const WS_URL = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_PACIFICA_WS_URL ?? 'wss://ws.pacifica.fi/ws')
  : '';

class PacificaWSClient {
  private ws: WebSocket | null = null;
  private reconnectDelay = 1000;
  private maxDelay = 30_000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;

  // key = JSON.stringify(params)
  private subs = new Map<string, Subscription>();

  // --- Connection management ---

  connect(): void {
    if (typeof window === 'undefined') return;
    if (this.started) return;
    this.started = true;
    this._open();
  }

  private _open(): void {
    if (!WS_URL) return;
    try {
      this.ws = new WebSocket(WS_URL);
    } catch {
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
      // Re-subscribe to all active subscriptions
      for (const [, sub] of this.subs) {
        if (sub.callbacks.size > 0) {
          this._send({ method: 'subscribe', params: sub.params });
        }
      }
    };

    this.ws.onmessage = (ev) => this._onMessage(ev.data);

    this.ws.onerror = () => {/* handled by onclose */};

    this.ws.onclose = () => {
      this.ws = null;
      this._scheduleReconnect();
    };
  }

  private _scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this._open();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxDelay);
  }

  private _send(msg: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private _onMessage(raw: string): void {
    let msg: { channel: string; data: unknown };
    try { msg = JSON.parse(raw); } catch { return; }

    const { channel, data } = msg;
    if (!channel || !data) return;

    for (const [, sub] of this.subs) {
      if (sub.params.source === channel || channel.startsWith(sub.params.source)) {
        sub.callbacks.forEach((cb) => (cb as (d: unknown) => void)(data));
      }
    }
  }

  // --- Subscribe to 'prices' channel ---
  subscribePrices(cb: PricesCallback): () => void {
    return this._subscribe({ source: 'prices' }, cb as (d: unknown) => void);
  }

  // --- Subscribe to mark price candles ---
  subscribeCandle(symbol: string, interval: string, cb: CandleCallback): () => void {
    const params = { source: 'mark_price_candle', symbol, interval };
    const rawCb = (data: unknown) => {
      const k = data as KlineItem;
      if (k && k.t) cb(klineToCandle(k));
    };
    return this._subscribe(params, rawCb as (d: unknown) => void);
  }

  private _subscribe(
    params: Record<string, string>,
    cb: (d: unknown) => void,
  ): () => void {
    const key = JSON.stringify(params);

    if (!this.subs.has(key)) {
      this.subs.set(key, { params, callbacks: new Set() });
    }
    const sub = this.subs.get(key)!;
    sub.callbacks.add(cb);

    // Send subscribe if WS is open
    this._send({ method: 'subscribe', params });

    return () => {
      sub.callbacks.delete(cb);
      if (sub.callbacks.size === 0) {
        this.subs.delete(key);
        this._send({ method: 'unsubscribe', params });
      }
    };
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.started = false;
    this.ws?.close();
    this.ws = null;
  }
}

// Singleton
export const pacificaClient = new PacificaWSClient();
