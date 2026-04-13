'use client';
import { useMemo } from 'react';
import { blackScholesPrice, computeGreeks, calcFee } from '@/lib/blackScholes';
import { expiryStringToYears } from '@/lib/constants';
import type { Side, Expiry, Greeks } from '@/types';

export function useBlackScholes(
  S: number,
  K: number,
  expiry: Expiry,
  sigma: number,
  side: Side,
  size: number
) {
  return useMemo(() => {
    const T = expiryStringToYears(expiry);
    const premium = blackScholesPrice(S, K, T, sigma, 0, side);
    const greeks: Greeks = computeGreeks(S, K, T, sigma, 0, side, size);
    const totalPremium = premium * size;
    const fee = calcFee(premium, size);
    const breakeven = side === 'call'
      ? K + premium
      : K - premium;
    return { premium, greeks, totalPremium, fee, breakeven };
  }, [S, K, expiry, sigma, side, size]);
}
