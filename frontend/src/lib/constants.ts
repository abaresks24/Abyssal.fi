export const PROGRAM_ID = process.env.NEXT_PUBLIC_PROGRAM_ID || 'CBkvR8SeN6j8RQKB7dSxG3dza2v71XHmWEe8LgfMW1hG';
// Authority that initialized the vault (set via NEXT_PUBLIC_VAULT_AUTHORITY env var)
export const VAULT_AUTHORITY = process.env.NEXT_PUBLIC_VAULT_AUTHORITY || '';
export const USDC_MINT = process.env.NEXT_PUBLIC_USDC_MINT || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
export const SOLANA_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
// Calls go through the Next.js proxy (/api/pacifica/*) to keep the API key server-side
export const PACIFICA_API_URL = '/api/pacifica';
export const PACIFICA_WS_URL = process.env.NEXT_PUBLIC_PACIFICA_WS_URL || 'wss://ws.pacifica.finance';

export const SCALE = 1_000_000;
export const PLATFORM_FEE_BPS = 5;      // 0.05%
export const SETTLEMENT_FEE_BPS = 5;    // 0.05% ITM, capped at 50 USDC
export const SETTLEMENT_FEE_CAP = 50;   // USD
export const BPS_DENOM = 10_000;

export const CRYPTO_MARKETS = ['BTC', 'ETH', 'SOL'] as const;
export const EQUITY_MARKETS = ['NVDA', 'TSLA', 'PLTR', 'CRCL', 'HOOD', 'SP500'] as const;
export const COMMODITY_MARKETS = ['XAU', 'XAG', 'PAXG', 'PLATINUM', 'NATGAS', 'COPPER'] as const;
export const MARKETS = [...CRYPTO_MARKETS, ...EQUITY_MARKETS, ...COMMODITY_MARKETS] as const;

export const EXPIRY_OPTIONS = [
  { label: '1D',  days: 1 },
  { label: '7D',  days: 7 },
  { label: '14D', days: 14 },
  { label: '30D', days: 30 },
  { label: '60D', days: 60 },
  { label: '90D', days: 90 },
];

export const STRIKE_GRID_PCT = [70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130];

export const DEFAULT_SLIPPAGE_BPS = 100; // 1%

export const MAX_EXPIRY_DAYS = 90;
export const MIN_EXPIRY_HOURS = 1;

export const SECONDS_PER_YEAR = 365.25 * 24 * 3600;
export const SECONDS_PER_DAY = 86400;
