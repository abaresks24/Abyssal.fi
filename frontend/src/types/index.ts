// ── Core domain types ─────────────────────────────────────────────────────────

export type Market = 'BTC' | 'ETH' | 'SOL'
  | 'NVDA' | 'TSLA' | 'PLTR' | 'CRCL' | 'HOOD' | 'SP500'
  | 'XAU' | 'XAG' | 'PAXG' | 'PLATINUM' | 'NATGAS' | 'COPPER';

export type CryptoMarket = 'BTC' | 'ETH' | 'SOL';

export type Side = 'call' | 'put';

export type Expiry = '1D' | '3D' | '7D' | '14D' | '30D';

export const EXPIRY_TO_YEARS: Record<Expiry, number> = {
  '1D':  1 / 365,
  '3D':  3 / 365,
  '7D':  7 / 365,
  '14D': 14 / 365,
  '30D': 30 / 365,
};

export const EXPIRY_LABELS: Expiry[] = ['1D', '3D', '7D', '14D', '30D'];

// ── Price / Market data ───────────────────────────────────────────────────────

export interface Candle {
  timestamp: number;  // unix ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketStats {
  market: string;
  markPrice: number;
  indexPrice: number;
  change24h: number;
  changePct24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  openInterest: number;
  fundingRate: number;
}

export interface FundingRate {
  rate: number;
  timestamp: number;
}

export interface PriceFeed {
  market: string;
  price: number;
  bid: number;
  ask: number;
  change24h: number;
  volume24h: number;
  timestamp: number;
}

// ── Options ───────────────────────────────────────────────────────────────────

export interface Greeks {
  delta: number;
  gamma: number;
  theta: number;  // per day in USDC × size
  vega: number;   // per 1% vol move in USDC × size
}

export interface OptionSeries {
  market: Market;
  side: Side;
  strike: number;
  expiry: Expiry;
  premium: number;   // BS price per unit in USDC
  iv: number;        // AFVR implied vol (decimal, e.g. 0.64)
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}

export interface Position {
  id: string;
  market: Market;
  side: Side;
  strike: number;
  expiry: Expiry;
  size: number;
  premiumPaid: number;
  entryIV: number;
  openedAt: number;
  pnl: number;
}

// ── Option Builder state ──────────────────────────────────────────────────────

export interface OptionBuilderState {
  market: Market;
  side: Side;
  strike: number;
  expiry: Expiry;
  size: number;
}

// ── Legacy compat (keep anchor_client happy) ──────────────────────────────────

export type OptionType = 'Call' | 'Put';
export type PositionStatus = 'open' | 'closed' | 'exercised' | 'expired' | 'settled';

export const MARKET_DISCRIMINANTS: Record<string, number> = {
  BTC: 0, ETH: 1, SOL: 2,
  NVDA: 3, TSLA: 4, PLTR: 5, CRCL: 6, HOOD: 7, SP500: 8,
  XAU: 9, XAG: 10, PAXG: 11, PLATINUM: 12, NATGAS: 13, COPPER: 14,
};

export const OPTION_TYPE_DISCRIMINANTS: Record<string, number> = {
  Call: 0, Put: 1,
};

export interface TradeFormState {
  market: string;
  optionType: OptionType;
  strike: number;
  expiry: Date;
  size: number;
  slippageBps: number;
}

/** On-chain position account as returned by anchor_client */
export interface OptionPositionAccount {
  pubkey: string;
  owner: string;
  market: Market;
  optionType: OptionType;
  strike: number;
  expiry: Date;
  size: number;
  premiumPaid: number;
  entryIv: number;
  entryDelta: number;
  settled: boolean;
  payoffReceived: number;
  createdAt: Date;
  status: PositionStatus;
}

export interface IVSurfacePoint {
  strike: number;
  expiry: number;
  iv: number;
}
