'use client';
import { useMemo } from 'react';
import { buildOptionChain } from '@/lib/blackScholes';
import { computeStrikes, EXPIRY_OPTIONS } from '@/lib/constants';
import type { Market, OptionSeries } from '@/types';

export function useOptionChain(market: Market, spot: number, iv: number): OptionSeries[] {
  return useMemo(() => {
    if (spot <= 0 || iv <= 0) return [];
    const strikes = computeStrikes(spot);
    return buildOptionChain(market, spot, iv, strikes, EXPIRY_OPTIONS);
  }, [market, spot, iv]);
}
