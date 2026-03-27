'use client';
import { useMemo } from 'react';
import { blackScholes, quotePremium } from '@/lib/black_scholes';
import type { Market, OptionType, Greeks } from '@/types';
import { SECONDS_PER_YEAR } from '@/lib/constants';

interface UseGreeksInput {
  optionType: OptionType;
  spot: number;
  strike: number;
  iv: number;             // decimal (e.g. 0.5 = 50%)
  expiryTs: number;       // unix timestamp (seconds)
  size: number;           // in underlying units
  nowTs?: number;
}

interface UseGreeksResult {
  price: number;           // unit premium (USDC per 1 underlying)
  totalPremium: number;    // size * unit premium
  fee: number;             // platform fee
  totalWithFee: number;
  greeks: Greeks;
  greeksTotal: Greeks;     // scaled by size
  T: number;               // time to expiry in years
  d1: number;
  d2: number;
  isExpired: boolean;
}

/**
 * Computes Black-Scholes price and Greeks for a given option specification.
 * Re-computes whenever inputs change.
 */
export function useGreeks(input: UseGreeksInput): UseGreeksResult {
  const nowTs = input.nowTs ?? (Date.now() / 1000);

  return useMemo(() => {
    const T = Math.max((input.expiryTs - nowTs) / SECONDS_PER_YEAR, 0);
    const isExpired = T <= 0;

    if (isExpired || input.spot <= 0 || input.strike <= 0 || input.iv <= 0) {
      const intrinsic = input.optionType === 'Call'
        ? Math.max(input.spot - input.strike, 0)
        : Math.max(input.strike - input.spot, 0);
      const emptyGreeks: Greeks = { delta: 0, gamma: 0, theta: 0, vega: 0 };
      return {
        price: intrinsic,
        totalPremium: intrinsic * input.size,
        fee: 0,
        totalWithFee: intrinsic * input.size,
        greeks: emptyGreeks,
        greeksTotal: emptyGreeks,
        T,
        d1: 0,
        d2: 0,
        isExpired,
      };
    }

    const { unitPremium, rawTotal, fee, totalWithFee, greeks } = quotePremium(
      input.optionType,
      input.spot,
      input.strike,
      input.iv,
      T,
      input.size
    );

    const { d1, d2 } = blackScholes(
      input.spot,
      input.strike,
      input.iv,
      T,
      input.optionType === 'Call'
    );

    const greeksTotal: Greeks = {
      delta: greeks.delta * input.size,
      gamma: greeks.gamma * input.size,
      theta: greeks.theta * input.size,
      vega: greeks.vega * input.size,
    };

    return {
      price: unitPremium,
      totalPremium: rawTotal,
      fee,
      totalWithFee,
      greeks,
      greeksTotal,
      T,
      d1,
      d2,
      isExpired,
    };
  }, [
    input.optionType,
    input.spot,
    input.strike,
    input.iv,
    input.expiryTs,
    input.size,
    nowTs,
  ]);
}

/**
 * Portfolio-level Greeks (sum across all positions).
 */
export function usePortfolioGreeks(
  positions: Array<{
    optionType: OptionType;
    spot: number;
    strike: number;
    iv: number;
    expiryTs: number;
    size: number;
  }>
): Greeks {
  return useMemo(() => {
    const now = Date.now() / 1000;
    return positions.reduce<Greeks>(
      (acc, pos) => {
        const T = Math.max((pos.expiryTs - now) / SECONDS_PER_YEAR, 0);
        if (T <= 0 || pos.spot <= 0) return acc;

        const { greeks } = blackScholes(
          pos.spot, pos.strike, pos.iv, T, pos.optionType === 'Call'
        );
        return {
          delta: acc.delta + greeks.delta * pos.size,
          gamma: acc.gamma + greeks.gamma * pos.size,
          theta: acc.theta + greeks.theta * pos.size,
          vega: acc.vega + greeks.vega * pos.size,
        };
      },
      { delta: 0, gamma: 0, theta: 0, vega: 0 }
    );
  }, [positions]);
}
