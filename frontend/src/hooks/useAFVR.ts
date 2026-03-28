'use client';
import { useMemo } from 'react';
import { computeAFVR } from '@/lib/afvr';
import { useFundingRate } from './useFundingRate';

export function useAFVR(market: string) {
  const { rateHistory, isLoading } = useFundingRate(market);

  const iv = useMemo(() => computeAFVR(market, rateHistory), [market, rateHistory]);

  return {
    iv,
    ivPercent: `${(iv * 100).toFixed(1)}%`,
    isStale: isLoading,
  };
}
