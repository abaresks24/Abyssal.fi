/**
 * Price feed for Abyssal.fi
 *
 * Crypto (BTC / ETH / SOL / PAXG): CoinGecko free API, polled every 20 s.
 * Equities + other commodities: seeded realistic prices with a random walk
 * so the UI feels live even without a real data subscription.
 */

import type { CryptoMarket, PriceFeed } from '@/types';

// ── CoinGecko IDs ────────────────────────────────────────────────────────────

const CG_IDS: Record<string, string> = {
  BTC:  'bitcoin',
  ETH:  'ethereum',
  SOL:  'solana',
  PAXG: 'pax-gold',
};

// ── Seed prices (realistic as of early 2025 — updated by CG for crypto) ─────

const SEED_PRICES: Record<string, number> = {
  // Crypto — will be overwritten by CoinGecko on first poll
  BTC:      85_000,
  ETH:       2_000,
  SOL:         135,
  PAXG:      3_200,
  // Equities
  NVDA:       870,
  TSLA:       170,
  PLTR:        25,
  CRCL:        31,
  HOOD:        36,
  SP500:     5_300,
  // Commodities
  XAU:       3_100,
  XAG:          32,
  PLATINUM:  1_000,
  NATGAS:       3.5,
  COPPER:       4.7,
};

// Typical 24-h absolute move (% of price) per asset
const VOLATILITY: Record<string, number> = {
  BTC: 0.03, ETH: 0.04, SOL: 0.05, PAXG: 0.005,
  NVDA: 0.025, TSLA: 0.035, PLTR: 0.04, CRCL: 0.03, HOOD: 0.04, SP500: 0.01,
  XAU: 0.005, XAG: 0.008, PLATINUM: 0.006, NATGAS: 0.02, COPPER: 0.01,
};

// ── Internal state ────────────────────────────────────────────────────────────

type FeedCallback = (feed: PriceFeed) => void;

const _prices: Record<string, number> = { ...SEED_PRICES };
const _prevPrices: Record<string, number> = { ...SEED_PRICES };
const _open24h: Record<string, number> = { ...SEED_PRICES };       // price 24h ago (approximate)
const _callbacks: Map<string, Set<FeedCallback>> = new Map();

let _started = false;
let _cgTimer: ReturnType<typeof setInterval> | null = null;
let _tickTimer: ReturnType<typeof setInterval> | null = null;

// ── CoinGecko fetch ───────────────────────────────────────────────────────────

async function _fetchCoinGecko(): Promise<void> {
  const symbols = Object.keys(CG_IDS);
  const ids = Object.values(CG_IDS).join(',');
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
      { signal: AbortSignal.timeout(8_000) }
    );
    if (!res.ok) return;
    const data = await res.json();
    for (const sym of symbols) {
      const cgId = CG_IDS[sym];
      const usd = data[cgId]?.usd;
      const change = data[cgId]?.usd_24h_change ?? 0;
      if (usd && usd > 0) {
        _prevPrices[sym] = _prices[sym];
        _prices[sym] = usd;
        // Back-calculate 24h open from the change pct
        _open24h[sym] = usd / (1 + change / 100);
        _emit(sym);
      }
    }
  } catch {
    // network error — keep last known price
  }
}

// ── Random-walk tick for all assets ──────────────────────────────────────────

function _tick(): void {
  const now = Object.keys(_prices);
  for (const sym of now) {
    const vol = VOLATILITY[sym] ?? 0.02;
    // Per-tick noise: annual vol scaled to ~5 s interval
    // σ_tick = σ_annual / sqrt(365 * 24 * 3600 / 5)
    const sigma = vol / Math.sqrt(365 * 24 * 720);
    const move = _prices[sym] * sigma * _randn();
    _prevPrices[sym] = _prices[sym];
    _prices[sym] = Math.max(_prices[sym] + move, _prices[sym] * 0.5);
    _emit(sym);
  }
}

function _randn(): number {
  // Box–Muller
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function _emit(sym: string): void {
  const price = _prices[sym];
  const open  = _open24h[sym] || price;
  const change24h = open > 0 ? ((price - open) / open) * 100 : 0;
  const feed: PriceFeed = {
    market:    sym,
    price,
    bid:       price * 0.9995,
    ask:       price * 1.0005,
    change24h,
    volume24h: 0,
    timestamp: Date.now(),
  };
  _callbacks.get(sym)?.forEach((cb) => cb(feed));
  _callbacks.get('*')?.forEach((cb) => cb(feed));
}

// ── Public API ────────────────────────────────────────────────────────────────

export class PacificaWebSocket {
  /** subscribe to price updates for a symbol. Returns unsubscribe fn. */
  subscribe(market: string, cb: FeedCallback): () => void {
    if (!_callbacks.has(market)) _callbacks.set(market, new Set());
    _callbacks.get(market)!.add(cb);
    // Immediately emit last known price so the UI doesn't wait
    if (_prices[market]) {
      const open = _open24h[market] || _prices[market];
      const change24h = open > 0 ? ((_prices[market] - open) / open) * 100 : 0;
      cb({
        market,
        price:     _prices[market],
        bid:       _prices[market] * 0.9995,
        ask:       _prices[market] * 1.0005,
        change24h,
        volume24h: 0,
        timestamp: Date.now(),
      });
    }
    return () => _callbacks.get(market)?.delete(cb);
  }

  connect(_markets?: string[]): void {
    if (typeof window === 'undefined') return;
    if (_started) return;
    _started = true;

    // Fetch crypto prices immediately, then every 20 s
    _fetchCoinGecko();
    _cgTimer = setInterval(_fetchCoinGecko, 20_000);

    // Random-walk tick for all assets every 3 s
    _tickTimer = setInterval(_tick, 3_000);
  }

  disconnect(): void {
    if (_cgTimer)   clearInterval(_cgTimer);
    if (_tickTimer) clearInterval(_tickTimer);
    _started = false;
  }
}

// ── REST client (legacy compat) ──────────────────────────────────────────────

class PacificaAPI {
  async getMarkPrice(market: string): Promise<number> {
    return _prices[market] ?? 0;
  }

  async getAllPrices(): Promise<Record<CryptoMarket, number>> {
    return { BTC: _prices['BTC'] ?? 0, ETH: _prices['ETH'] ?? 0, SOL: _prices['SOL'] ?? 0 };
  }

  async getIVSurface(_market: string) { return null; }
  async getFundingRate(_market: string) { return 0; }
  async getOpenInterest(_market: string) { return 0; }
}

// ── Singleton instances ──────────────────────────────────────────────────────

export const pacificaApi = new PacificaAPI();
export const pacificaWs  = new PacificaWebSocket();

export type { FeedCallback as TickerCallback };

export function startMockFeed(_onTick: (feed: PriceFeed) => void, _intervalMs = 2000): () => void {
  return () => {};
}
