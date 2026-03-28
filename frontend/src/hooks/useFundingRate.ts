'use client';
import { useEffect, useState } from 'react';
import { usePacificaWS } from './usePacificaWS';

/** Fetch 90 periods of funding rate history from Pacifica REST */
async function fetchFundingHistory(market: string): Promise<number[]> {
  try {
    const res = await fetch(`/api/pacifica/v1/funding_rate/history?symbol=${market}&limit=90`, {
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const json = await res.json();
    if (!json.success || !Array.isArray(json.data)) return [];
    return (json.data as { funding_rate: string }[])
      .map((d) => parseFloat(d.funding_rate))
      .filter((r) => isFinite(r))
      .reverse(); // oldest first
  } catch {
    return [];
  }
}

export function useFundingRate(market: string) {
  const [rateHistory, setRateHistory] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { fundingRate } = usePacificaWS(market);

  // Fetch history on mount
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    fetchFundingHistory(market).then((rates) => {
      if (cancelled) return;
      if (rates.length > 0) setRateHistory(rates);
      setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, [market]);

  // Prepend live rate when it changes (from WS prices channel)
  useEffect(() => {
    if (fundingRate === 0) return;
    setRateHistory((prev) => {
      if (prev.length === 0) return [fundingRate];
      const last = prev[prev.length - 1];
      // Only append if it changed meaningfully
      if (Math.abs(last - fundingRate) < 0.000001) return prev;
      return [...prev.slice(1), fundingRate];
    });
  }, [fundingRate]);

  const currentRate = fundingRate !== 0
    ? fundingRate
    : (rateHistory[rateHistory.length - 1] ?? 0);

  return { currentRate, rateHistory, isLoading };
}
