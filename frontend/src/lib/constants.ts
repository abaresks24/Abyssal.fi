import { PublicKey } from '@solana/web3.js';
import type { Market, Expiry } from '@/types';

// ── Program / network ─────────────────────────────────────────────────────────
// Use || (not ??) so empty strings from Vercel env vars fall through to defaults.

// Hardcoded — the deployed program address must match the IDL.
// Do NOT override via env var (mismatches cause AccountNotInitialized).
export const PROGRAM_ID       = new PublicKey('CBkvR8SeN6j8RQKB7dSxG3dza2v71XHmWEe8LgfMW1hG');
export const USDC_MINT        = new PublicKey(process.env.NEXT_PUBLIC_USDC_MINT || 'USDPqRbLidFGufty2s3oizmDEKdqx7ePTqzDMbf5ZKM');
export const SOLANA_RPC       = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
export const VAULT_AUTHORITY  = process.env.NEXT_PUBLIC_VAULT_AUTHORITY || 'AHWUeGsXbx9gd46SBS5SQK4rfQ8rGb1wWAzvZtJ6zdRg';
export const PACIFICA_FAUCET_PROGRAM_ID = process.env.NEXT_PUBLIC_PACIFICA_FAUCET_PROGRAM_ID || 'peRPsYCcB1J9jvrs29jiGdjkytxs8uHLmSPLKKP9ptm';

// Debug: log resolved values at startup (visible in browser console)
if (typeof window !== 'undefined') {
  console.log('[Abyssal] PROGRAM_ID:', PROGRAM_ID.toBase58());
  console.log('[Abyssal] VAULT_AUTHORITY:', VAULT_AUTHORITY);
  console.log('[Abyssal] SOLANA_RPC:', SOLANA_RPC);
}

// ── Solscan helpers (cluster-aware) ───────────────────────────────────────────

/** 'devnet' | 'testnet' | undefined (mainnet) */
export const SOLANA_CLUSTER = (() => {
  const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? '';
  if (rpc.includes('devnet'))  return 'devnet';
  if (rpc.includes('testnet')) return 'testnet';
  return undefined;
})();

const clusterParam = SOLANA_CLUSTER ? `?cluster=${SOLANA_CLUSTER}` : '';
export const solscanTx      = (sig: string)    => `https://solscan.io/tx/${sig}${clusterParam}`;
export const solscanAccount = (addr: string)   => `https://solscan.io/account/${addr}${clusterParam}`;
export const solscanToken   = (mint: string)   => `https://solscan.io/token/${mint}${clusterParam}`;

// ── Fees ──────────────────────────────────────────────────────────────────────

export const PLATFORM_FEE_BPS = 5;
export const BPS_DENOM = 10_000;
export const SCALE = 1_000_000;

// ── Markets ───────────────────────────────────────────────────────────────────

export const MARKETS: Market[] = ['BTC', 'ETH', 'SOL'];

export const MARKET_LABELS: Partial<Record<Market, string>> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  SOL: 'Solana',
};

export const MARKET_DECIMALS: Partial<Record<Market, number>> = {
  BTC: 0,
  ETH: 0,
  SOL: 2,
};

// ── Strikes ───────────────────────────────────────────────────────────────────

/** Offsets from spot. 6 strikes around ATM. */
export const STRIKE_OFFSETS = [-0.10, -0.05, 0, +0.05, +0.10, +0.20] as const;

export function computeStrikes(spot: number): number[] {
  return STRIKE_OFFSETS.map((o) => Math.round((spot * (1 + o)) / 100) * 100);
}

// ── Expiries ──────────────────────────────────────────────────────────────────

export const EXPIRY_OPTIONS: string[] = ['1D', '3D', '7D', '14D', '30D'];

export const EXPIRY_TO_YEARS: Record<string, number> = {
  '1D':  1 / 365,
  '3D':  3 / 365,
  '7D':  7 / 365,
  '14D': 14 / 365,
  '30D': 30 / 365,
};

/** Convert any expiry string like "7D" or "45D" to a Date (8:00 UTC). */
export function expiryToDate(expiry: string): Date {
  const days = parseInt(expiry, 10);
  const d = new Date();
  d.setDate(d.getDate() + (isNaN(days) ? 7 : days));
  d.setHours(8, 0, 0, 0);
  return d;
}

/** Convert any expiry string to fractional years for Black-Scholes. */
export function expiryStringToYears(expiry: string): number {
  const days = parseInt(expiry, 10);
  if (isNaN(days) || days <= 0) return 7 / 365;
  return days / 365;
}

// ── Pacifica API endpoints ────────────────────────────────────────────────────

export const PACIFICA_REST  = process.env.NEXT_PUBLIC_PACIFICA_REST_URL  ?? '';
export const PACIFICA_WS    = process.env.NEXT_PUBLIC_PACIFICA_WS_URL    ?? '';
export const PACIFICA_KEY   = process.env.NEXT_PUBLIC_PACIFICA_API_KEY   ?? '';

// ── Market discriminants (on-chain) ───────────────────────────────────────────

export const MARKET_DISC: Record<string, number> = {
  BTC: 0, ETH: 1, SOL: 2,
};
