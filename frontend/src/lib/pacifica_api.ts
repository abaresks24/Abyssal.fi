/**
 * Pacifica REST + WebSocket API client (frontend).
 * Provides real-time price feeds and market data.
 */

import { PACIFICA_API_URL, PACIFICA_WS_URL } from './constants';
import type { Market, CryptoMarket, PriceFeed, IVSurface } from '@/types';

// ── REST Client ──────────────────────────────────────────────────────────────

class PacificaAPI {
  private baseUrl: string;

  constructor(baseUrl: string = PACIFICA_API_URL) {
    this.baseUrl = baseUrl;
  }

  private async fetch<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
    if (!res.ok) {
      throw new Error(`Pacifica API error ${res.status}: ${await res.text()}`);
    }
    return res.json() as Promise<T>;
  }

  async getMarkPrice(market: Market): Promise<number> {
    try {
      const data = await this.fetch<{ markPrice?: string; lastPrice?: string }>(
        `/v1/markets/${market}-PERP/ticker`
      );
      return parseFloat(data.markPrice || data.lastPrice || '0');
    } catch {
      return 0;
    }
  }

  async getAllPrices(): Promise<Record<CryptoMarket, number>> {
    const markets: CryptoMarket[] = ['BTC', 'ETH', 'SOL'];
    const entries = await Promise.all(
      markets.map(async (m) => [m, await this.getMarkPrice(m)] as const)
    );
    const prices = Object.fromEntries(entries) as Record<CryptoMarket, number>;

    // If any price is missing, fall back to CoinGecko (free, no key needed)
    if (Object.values(prices).some((p) => p <= 0)) {
      try {
        const cg = await fetchCoinGeckoPrices();
        for (const m of markets) {
          if (prices[m] <= 0 && cg[m] > 0) prices[m] = cg[m];
        }
      } catch {
        // All sources down — leave as 0, UI will show no price
      }
    }

    return prices;
  }

  async getIVSurface(market: Market): Promise<IVSurface | null> {
    try {
      return await this.fetch<IVSurface>(`/v1/options/${market}/iv-surface`);
    } catch {
      return null;
    }
  }

  async getFundingRate(market: Market): Promise<number> {
    try {
      const data = await this.fetch<{ fundingRate?: string }>(
        `/v1/markets/${market}-PERP/funding`
      );
      return parseFloat(data.fundingRate || '0');
    } catch {
      return 0;
    }
  }

  async getOpenInterest(market: Market): Promise<number> {
    try {
      const data = await this.fetch<{ openInterest?: string }>(
        `/v1/markets/${market}-PERP/stats`
      );
      return parseFloat(data.openInterest || '0');
    } catch {
      return 0;
    }
  }
}

// ── WebSocket Client ─────────────────────────────────────────────────────────

export type TickerCallback = (feed: PriceFeed) => void;

export class PacificaWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private callbacks: Map<string, Set<TickerCallback>> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private shouldReconnect = true;
  private subscribedMarkets: Set<Market> = new Set();

  constructor(url: string = PACIFICA_WS_URL) {
    this.url = url;
  }

  connect(markets: Market[] = ['BTC', 'ETH', 'SOL']): void {
    markets.forEach((m) => this.subscribedMarkets.add(m));
    // Don't open a second connection if one is already live or connecting
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this._connect();
  }

  private _connect(): void {
    if (typeof window === 'undefined') return;

    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectDelay = 1000;
      // Pacifica SDK format: ws/subscribe_prices.py
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ method: 'subscribe', params: { source: 'prices' } }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        // Only process price channel updates (ignore subscription ack)
        if (msg.channel !== 'prices' || !Array.isArray(msg.data)) return;

        for (const item of msg.data) {
          const market: string = item.symbol;
          if (!market) continue;

          const price = parseFloat(item.mark);
          if (!price) continue;

          const yesterdayPrice = parseFloat(item.yesterday_price) || price;
          const change24h = ((price - yesterdayPrice) / yesterdayPrice) * 100;

          const feed: PriceFeed = {
            market,
            price,
            bid: parseFloat(item.mid) || price,
            ask: parseFloat(item.mid) || price,
            change24h,
            volume24h: parseFloat(item.volume_24h) || 0,
            timestamp: item.timestamp ?? Date.now(),
          };

          this._emit(market, feed);
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      if (this.ws === ws) this.ws = null;
      if (this.shouldReconnect) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
          this._connect();
        }, this.reconnectDelay);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  subscribe(market: string, cb: TickerCallback): () => void {
    if (!this.callbacks.has(market)) {
      this.callbacks.set(market, new Set());
    }
    this.callbacks.get(market)!.add(cb);
    // Return unsubscribe fn
    return () => this.callbacks.get(market)?.delete(cb);
  }

  private _emit(market: string, feed: PriceFeed): void {
    this.callbacks.get(market)?.forEach((cb) => cb(feed));
    this.callbacks.get('*')?.forEach((cb) => cb(feed));
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}

// ── Singleton instances ──────────────────────────────────────────────────────

export const pacificaApi = new PacificaAPI();
export const pacificaWs = new PacificaWebSocket();

// ── CoinGecko fallback (no API key required) ──────────────────────────────────

const COINGECKO_IDS: Record<CryptoMarket, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
};

async function fetchCoinGeckoPrices(): Promise<Record<CryptoMarket, number>> {
  const ids = Object.values(COINGECKO_IDS).join(',');
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
    { next: { revalidate: 30 } }
  );
  if (!res.ok) throw new Error('CoinGecko error');
  const data = await res.json();
  return {
    BTC: data['bitcoin']?.usd ?? 0,
    ETH: data['ethereum']?.usd ?? 0,
    SOL: data['solana']?.usd ?? 0,
  };
}

export function startMockFeed(
  _onTick: (feed: PriceFeed) => void,
  _intervalMs = 2000
): () => void {
  // Mock feed disabled — real prices come from Pacifica API or CoinGecko fallback
  return () => {};
}
