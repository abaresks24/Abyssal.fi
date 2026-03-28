/**
 * Pacifica data client.
 * - Real prices: CoinGecko for BTC/ETH/SOL (updated every 20s)
 * - Synthetic OHLCV: generated from price ticks + seeded history
 * - Synthetic funding rate: realistic random walk
 */

import { pacificaWs as _legacyWs } from './pacifica_api';
import type { Candle, FundingRate, MarketStats, PriceFeed } from '@/types';

// Re-export the legacy WS for price ticks (it handles CoinGecko + random walk)
export { pacificaWs } from './pacifica_api';

// ── Synthetic OHLCV generation ────────────────────────────────────────────────

const SEED: Record<string, number> = {
  BTC: 85_000, ETH: 2_000, SOL: 135,
};

const VOL: Record<string, number> = {
  BTC: 0.03, ETH: 0.04, SOL: 0.05,
};

function randn(): number {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Generate N historical 1h candles ending now */
export function generateHistoricalCandles(market: string, count = 200): Candle[] {
  const vol    = VOL[market] ?? 0.03;
  const sigmaH = vol / Math.sqrt(365 * 24); // hourly sigma
  const now    = Date.now();
  const msPerH = 3_600_000;

  let price = SEED[market] ?? 100;
  const candles: Candle[] = [];

  for (let i = count; i >= 0; i--) {
    const ts     = now - i * msPerH;
    const pctMov = sigmaH * randn();
    const open   = price;
    const close  = Math.max(price * (1 + pctMov), price * 0.5);
    const hi     = Math.max(open, close) * (1 + Math.abs(randn()) * sigmaH * 0.5);
    const lo     = Math.min(open, close) * (1 - Math.abs(randn()) * sigmaH * 0.5);
    const vol24  = price * (0.0005 + Math.random() * 0.002);
    candles.push({ timestamp: ts, open, high: hi, low: lo, close, volume: vol24 });
    price = close;
  }

  return candles;
}

/** Generate 90 historical funding rates (8h periods) */
export function generateFundingHistory(market: string): FundingRate[] {
  const baseFunding = market === 'BTC' ? 0.0001 : market === 'ETH' ? 0.00015 : 0.0002;
  const now = Date.now();
  const period = 8 * 3_600_000;
  const rates: FundingRate[] = [];

  for (let i = 89; i >= 0; i--) {
    const noise = (Math.random() - 0.5) * 0.0002;
    rates.push({ rate: baseFunding + noise, timestamp: now - i * period });
  }

  return rates;
}

/** Get current market stats (derived from latest cached price) */
export function getMarketStats(market: string): MarketStats {
  // We'll fill this from the price hook — return placeholder until first tick
  return {
    market,
    markPrice: SEED[market] ?? 0,
    indexPrice: SEED[market] ?? 0,
    change24h: 0,
    changePct24h: 0,
    high24h: (SEED[market] ?? 0) * 1.02,
    low24h: (SEED[market] ?? 0) * 0.98,
    volume24h: 0,
    openInterest: 0,
    fundingRate: 0.0001,
  };
}
