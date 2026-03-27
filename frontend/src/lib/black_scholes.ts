/**
 * Black-Scholes pricing and Greeks for European options.
 * All inputs in human-readable units (not fixed-point).
 */

import type { Greeks, OptionType } from '@/types';

const SQRT_2PI = Math.sqrt(2 * Math.PI);

/** Standard normal CDF using Taylor approximation */
export function normalCdf(x: number): number {
  if (x > 8) return 1;
  if (x < -8) return 0;
  return 0.5 * erfc(-x / Math.SQRT2);
}

function erfc(x: number): number {
  // Horner's method approximation
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const tau =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t *
                              (-1.13520398 +
                                t * (1.48851587 + t * (-0.82215223 + t * 0.17087294))))))))
    );
  return x >= 0 ? tau : 2 - tau;
}

/** Standard normal PDF */
export function normalPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / SQRT_2PI;
}

export interface BSResult {
  price: number;
  greeks: Greeks;
  d1: number;
  d2: number;
  iv: number;
}

/**
 * Black-Scholes pricing (European, r=0).
 *
 * @param spot      Current price of underlying
 * @param strike    Strike price
 * @param sigma     Annualised volatility (e.g. 0.5 = 50%)
 * @param T         Time to expiry in years
 * @param isCall    True for call, false for put
 * @returns         BSResult with price, greeks, d1, d2
 */
export function blackScholes(
  spot: number,
  strike: number,
  sigma: number,
  T: number,
  isCall: boolean
): BSResult {
  if (T <= 0 || sigma <= 0 || spot <= 0 || strike <= 0) {
    const intrinsic = isCall
      ? Math.max(spot - strike, 0)
      : Math.max(strike - spot, 0);
    const delta = isCall
      ? spot > strike ? 1 : 0
      : spot < strike ? -1 : 0;
    return {
      price: intrinsic,
      greeks: { delta, gamma: 0, theta: 0, vega: 0 },
      d1: 0,
      d2: 0,
      iv: sigma,
    };
  }

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(spot / strike) + 0.5 * sigma * sigma * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  const Nd1 = normalCdf(d1);
  const Nd2 = normalCdf(d2);
  const phiD1 = normalPdf(d1);

  let price: number;
  let delta: number;

  if (isCall) {
    price = spot * Nd1 - strike * Nd2;
    delta = Nd1;
  } else {
    price = strike * normalCdf(-d2) - spot * normalCdf(-d1);
    delta = Nd1 - 1;
  }

  // Gamma = φ(d1) / (S * σ * √T)
  const gamma = phiD1 / (spot * sigma * sqrtT);

  // Theta per day = -(S * φ(d1) * σ) / (2 * √T) / 365
  const thetaYear = -(spot * phiD1 * sigma) / (2 * sqrtT);
  const theta = thetaYear / 365;

  // Vega per 1% vol move = S * φ(d1) * √T / 100
  const vega = (spot * phiD1 * sqrtT) / 100;

  return {
    price: Math.max(price, 0),
    greeks: { delta, gamma, theta, vega },
    d1,
    d2,
    iv: sigma,
  };
}

/**
 * Compute call and put prices with Greeks for a given IV.
 */
export function priceOption(
  optionType: OptionType,
  spot: number,
  strike: number,
  iv: number,
  expiryTs: number,
  nowTs: number = Date.now() / 1000
): BSResult {
  const T = Math.max((expiryTs - nowTs) / (365.25 * 24 * 3600), 0);
  return blackScholes(spot, strike, iv, T, optionType === 'Call');
}

/**
 * Compute implied volatility from option price using bisection method.
 * @returns IV as decimal or null if not solvable
 */
export function impliedVol(
  optionType: OptionType,
  spot: number,
  strike: number,
  T: number,
  marketPrice: number,
  tolerance = 1e-6,
  maxIter = 100
): number | null {
  if (T <= 0 || marketPrice <= 0) return null;

  let lo = 0.001;
  let hi = 10.0;

  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) / 2;
    const { price } = blackScholes(spot, strike, mid, T, optionType === 'Call');
    if (Math.abs(price - marketPrice) < tolerance) return mid;
    if (price < marketPrice) lo = mid;
    else hi = mid;
  }

  return (lo + hi) / 2;
}

/**
 * Apply platform fee: 5 bps (0.05%)
 * Returns { net, fee }
 */
export function applyPlatformFee(amount: number): { net: number; fee: number } {
  const fee = (amount * 5) / 10_000;
  return { net: amount - fee, fee };
}

/**
 * Apply settlement fee: 5 bps of payoff, capped at $50
 */
export function applySettlementFee(payoff: number): { net: number; fee: number } {
  const rawFee = (payoff * 5) / 10_000;
  const fee = Math.min(rawFee, 50);
  return { net: payoff - fee, fee };
}

/**
 * Compute total premium including platform fee (what user pays).
 */
export function quotePremium(
  optionType: OptionType,
  spot: number,
  strike: number,
  iv: number,
  T: number,
  size: number
): {
  unitPremium: number;
  rawTotal: number;
  fee: number;
  totalWithFee: number;
  greeks: Greeks;
} {
  const { price, greeks } = blackScholes(spot, strike, iv, T, optionType === 'Call');
  const rawTotal = price * size;
  const { fee } = applyPlatformFee(rawTotal);
  return {
    unitPremium: price,
    rawTotal,
    fee,
    totalWithFee: rawTotal + fee,
    greeks,
  };
}
