import type { Side, Greeks, Expiry } from '@/types';
import { EXPIRY_TO_YEARS } from '@/lib/constants';

// ── Math helpers ──────────────────────────────────────────────────────────────

/** Hart approximation — accurate to ~5 decimal places */
function normCDF(x: number): number {
  if (x < -8) return 0;
  if (x > 8)  return 1;
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;
  const sign = x < 0 ? -1 : 1;
  const t = 1 / (1 + p * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x / 2);
  return 0.5 * (1 + sign * (2 * y - 1));
}

function normPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// ── Black-Scholes price ───────────────────────────────────────────────────────

export function blackScholesPrice(
  S: number,      // underlying price
  K: number,      // strike
  T: number,      // time to expiry in years
  sigma: number,  // IV as decimal
  r = 0,          // risk-free rate (0 in DeFi)
  side: Side
): number {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return 0;
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  if (side === 'call') {
    return Math.max(S * normCDF(d1) - K * Math.exp(-r * T) * normCDF(d2), 0);
  }
  return Math.max(K * Math.exp(-r * T) * normCDF(-d2) - S * normCDF(-d1), 0);
}

// ── Greeks ────────────────────────────────────────────────────────────────────

export function computeGreeks(
  S: number,
  K: number,
  T: number,
  sigma: number,
  r = 0,
  side: Side,
  size = 1
): Greeks {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
    return { delta: 0, gamma: 0, theta: 0, vega: 0 };
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const pdf1 = normPDF(d1);

  const delta = side === 'call' ? normCDF(d1) : normCDF(d1) - 1;
  const gamma = pdf1 / (S * sigma * sqrtT);
  // theta per calendar day
  const theta = (
    -(S * pdf1 * sigma) / (2 * sqrtT)
    - r * K * Math.exp(-r * T) * (side === 'call' ? normCDF(d2) : normCDF(-d2))
  ) / 365;
  // vega per 1% vol move
  const vega = S * pdf1 * sqrtT * 0.01;

  return {
    delta,
    gamma: gamma * size,
    theta: theta * size,
    vega: vega * size,
  };
}

// ── Fee ───────────────────────────────────────────────────────────────────────

export function calcFee(premium: number, size: number): number {
  return premium * size * 5 / 10_000;
}

// ── Build full chain ──────────────────────────────────────────────────────────

import type { OptionSeries, Market } from '@/types';

export function buildOptionChain(
  market: Market,
  S: number,
  sigma: number,
  strikes: number[],
  expiries: Expiry[]
): OptionSeries[] {
  const series: OptionSeries[] = [];
  for (const expiry of expiries) {
    const T = EXPIRY_TO_YEARS[expiry];
    for (const strike of strikes) {
      for (const side of ['call', 'put'] as Side[]) {
        const premium = blackScholesPrice(S, strike, T, sigma, 0, side);
        const g = computeGreeks(S, strike, T, sigma, 0, side, 1);
        series.push({ market, side, strike, expiry, premium, iv: sigma, ...g });
      }
    }
  }
  return series;
}
