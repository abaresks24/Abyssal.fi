'use client';
import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import type { Market, OptionType, Position, LPPosition, TradeFormState, PriceQuote } from '@/types';
import { blackScholes, applyPlatformFee } from '@/lib/black_scholes';
import { SECONDS_PER_YEAR, SCALE, VAULT_AUTHORITY } from '@/lib/constants';
import { PacificaOptionsClient } from '@/lib/anchor_client';

// ── IV oracle fallback values (used when oracle fetch fails) ──────────────────
const IV_FALLBACK: Record<Market, number> = {
  // Crypto
  BTC: 0.65, ETH: 0.75, SOL: 0.90,
  // Equities
  NVDA: 0.40, TSLA: 0.60, PLTR: 0.65, CRCL: 0.55, HOOD: 0.70, SP500: 0.15,
  // Commodities
  XAU: 0.12, XAG: 0.18, PAXG: 0.12, PLATINUM: 0.20, NATGAS: 0.65, COPPER: 0.25,
};

/**
 * Fetches ATM IV from on-chain oracles for all three markets.
 * Falls back to hardcoded estimates until a successful fetch completes.
 */
export function useIVOracle(): Record<Market, number> {
  const [ivs, setIvs] = useState<Record<Market, number>>(IV_FALLBACK);

  useEffect(() => {
    if (!VAULT_AUTHORITY) return;

    let cancelled = false;
    const fetchIVs = async () => {
      try {
        const vaultAuth = new PublicKey(VAULT_AUTHORITY);
        const updates = await PacificaOptionsClient.getIVOraclesReadOnly(vaultAuth);
        if (cancelled) return;
        // Only apply markets where oracle returned a non-zero value
        const nonZero = Object.fromEntries(
          Object.entries(updates).filter(([, v]) => (v as number) > 0),
        ) as Partial<Record<Market, number>>;
        if (Object.keys(nonZero).length > 0) {
          setIvs((prev) => ({ ...prev, ...nonZero }));
        }
      } catch {}
    };

    fetchIVs();
    const timer = setInterval(fetchIVs, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return ivs;
}

// ── Mock position data for UI development ─────────────────────────────────────

function generateMockPositions(walletKey: string): Position[] {
  const now = Date.now() / 1000;
  return [
    {
      pubkey: 'pos_mock_1',
      owner: walletKey,
      market: 'BTC',
      optionType: 'Call',
      strike: 100_000,
      expiry: new Date((now + 7 * 86400) * 1000),
      size: 0.5,
      premiumPaid: 2_500,
      entryIv: 0.65,
      entryDelta: 0.35,
      settled: false,
      payoffReceived: 0,
      createdAt: new Date((now - 2 * 86400) * 1000),
      status: 'open',
    },
    {
      pubkey: 'pos_mock_2',
      owner: walletKey,
      market: 'ETH',
      optionType: 'Put',
      strike: 3_000,
      expiry: new Date((now + 14 * 86400) * 1000),
      size: 5,
      premiumPaid: 350,
      entryIv: 0.55,
      entryDelta: -0.28,
      settled: false,
      payoffReceived: 0,
      createdAt: new Date((now - 1 * 86400) * 1000),
      status: 'open',
    },
  ];
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/**
 * Hook to manage the user's option positions.
 */
const EMPTY_SPOT: Record<Market, number> = {
  BTC: 0, ETH: 0, SOL: 0,
  NVDA: 0, TSLA: 0, PLTR: 0, CRCL: 0, HOOD: 0, SP500: 0,
  XAU: 0, XAG: 0, PAXG: 0, PLATINUM: 0, NATGAS: 0, COPPER: 0,
};

export function usePositions(spot: Record<Market, number> = EMPTY_SPOT) {
  const { publicKey } = useWallet();
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);

  // Enrich positions with current PnL and greeks
  const enrichedPositions = positions.map((pos) => {
    const now = Date.now() / 1000;
    const T = Math.max((pos.expiry.getTime() / 1000 - now) / SECONDS_PER_YEAR, 0);
    const currentSpot = spot[pos.market] || 0;

    let currentPremium = 0;
    let greeks = { delta: 0, gamma: 0, theta: 0, vega: 0 };

    if (currentSpot > 0 && T > 0 && !pos.settled) {
      const result = blackScholes(
        currentSpot, pos.strike, pos.entryIv, T, pos.optionType === 'Call'
      );
      currentPremium = result.price * pos.size;
      greeks = result.greeks;
    }

    const pnl = pos.settled
      ? pos.payoffReceived - pos.premiumPaid
      : currentPremium - pos.premiumPaid;

    const isItm = pos.optionType === 'Call'
      ? currentSpot > pos.strike
      : currentSpot < pos.strike;

    return { ...pos, currentPremium, pnl, greeks, isItm };
  });

  const fetchPositions = useCallback(async () => {
    if (!publicKey) {
      setPositions([]);
      return;
    }
    setLoading(true);
    try {
      const onChain = await PacificaOptionsClient.getPositionsByOwner(publicKey);
      setPositions(onChain);
    } catch {
      // Fallback to mock data when RPC is unavailable (dev / no wallet)
      setPositions(generateMockPositions(publicKey.toString()));
    } finally {
      setLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  const refetch = useCallback(() => { fetchPositions(); }, [fetchPositions]);

  return {
    positions: enrichedPositions,
    loading,
    refetch,
    totalPnl: enrichedPositions.reduce((s, p) => s + (p.pnl || 0), 0),
    openCount: enrichedPositions.filter((p) => p.status === 'open').length,
  };
}

/**
 * Hook to manage LP positions.
 */
export function useLPPositions() {
  const { publicKey } = useWallet();
  const [positions, setPositions] = useState<LPPosition[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!publicKey) {
      setPositions([]);
      return;
    }
    setLoading(true);
    // Mock LP positions
    setTimeout(() => {
      setPositions([
        {
          pubkey: 'lp_mock_1',
          pool: 'pool_btc_call_100k_30d',
          market: 'BTC',
          optionType: 'Call',
          strike: 100_000,
          expiry: new Date(Date.now() + 30 * 86400 * 1000),
          lpTokens: 10_000,
          usdcDeposited: 10_000,
          currentValue: 10_250,
          pnl: 250,
          sharePercent: 5.2,
        },
      ]);
      setLoading(false);
    }, 500);
  }, [publicKey]);

  return { positions, loading };
}

/**
 * Hook for the trade form state and quote computation.
 */
export function useTradeForm(spot: Record<Market, number> = EMPTY_SPOT) {
  const DEFAULT_IV: Record<Market, number> = { ...IV_FALLBACK };

  const [form, setForm] = useState<TradeFormState>({
    market: 'BTC',
    optionType: 'Call',
    strike: 100_000,
    expiry: new Date(Date.now() + 7 * 86400 * 1000),
    size: 0.1,
    slippageBps: 100,
    action: 'buy',
  });

  const updateForm = useCallback((updates: Partial<TradeFormState>) => {
    setForm((prev) => ({ ...prev, ...updates }));
  }, []);

  // Compute quote
  const quote: PriceQuote | null = (() => {
    const currentSpot = spot[form.market] || 0;
    if (currentSpot <= 0) return null;

    const now = Date.now() / 1000;
    const T = Math.max((form.expiry.getTime() / 1000 - now) / SECONDS_PER_YEAR, 0);
    if (T <= 0) return null;

    const iv = DEFAULT_IV[form.market];
    const isCall = form.optionType === 'Call';
    const { price, greeks } = blackScholes(currentSpot, form.strike, iv, T, isCall);

    const rawTotal = price * form.size;
    const { fee } = applyPlatformFee(rawTotal);
    const totalWithFee = rawTotal + fee;

    return {
      series: {
        market: form.market,
        optionType: form.optionType,
        strike: form.strike,
        expiry: form.expiry,
        daysToExpiry: T * 365.25,
      },
      unitPremium: price,
      totalPremium: rawTotal,
      fee,
      iv,
      greeks,
    };
  })();

  return { form, updateForm, quote };
}
