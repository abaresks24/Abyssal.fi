import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

// ── Enums ────────────────────────────────────────────────────────────────────

// All supported markets — must match Rust Market enum discriminants exactly
export type Market =
  // Crypto (0–2)
  | 'BTC' | 'ETH' | 'SOL'
  // Equities (3–8)
  | 'NVDA' | 'TSLA' | 'PLTR' | 'CRCL' | 'HOOD' | 'SP500'
  // Commodities (9–14)
  | 'XAU' | 'XAG' | 'PAXG' | 'PLATINUM' | 'NATGAS' | 'COPPER';

export type CryptoMarket = 'BTC' | 'ETH' | 'SOL';
export type OptionType = 'Call' | 'Put';
export type PositionStatus = 'open' | 'expired' | 'settled' | 'exercised';

// ── On-chain State Types ─────────────────────────────────────────────────────

export interface IVParams {
  ivAtm: number;           // scaled 1e6
  ivSkewRho: number;       // signed, scaled 1e6
  ivCurvaturePhi: number;  // scaled 1e6
  thetaParam: number;      // scaled 1e6
}

export interface OptionVaultAccount {
  bump: number;
  authority: PublicKey;
  keeper: PublicKey;
  usdcMint: PublicKey;
  usdcVault: PublicKey;
  totalCollateral: BN;
  openInterest: BN;
  deltaNet: BN;
  ivParams: IVParams;
  lastIvUpdate: BN;
  feesCollected: BN;
  paused: boolean;
}

export interface OptionPositionAccount {
  bump: number;
  owner: PublicKey;
  vault: PublicKey;
  market: Market;
  optionType: OptionType;
  strike: BN;
  expiry: BN;
  size: BN;
  premiumPaid: BN;
  entryIv: BN;
  entryDelta: BN;
  settled: boolean;
  payoffReceived: BN;
  createdAt: BN;
}

export interface AmmPoolAccount {
  bump: number;
  vault: PublicKey;
  market: Market;
  optionType: OptionType;
  strike: BN;
  expiry: BN;
  reserveOptions: BN;
  reserveUsdc: BN;
  kInvariantLo: BN;
  kInvariantHi: BN;
  totalLpTokens: BN;
  feesEarned: BN;
  lastRebalance: BN;
}

export interface LPPositionAccount {
  bump: number;
  owner: PublicKey;
  pool: PublicKey;
  lpTokens: BN;
  usdcDeposited: BN;
  createdAt: BN;
}

// ── UI / Display Types ───────────────────────────────────────────────────────

export interface OptionSeries {
  market: Market;
  optionType: OptionType;
  strike: number;        // USDC price (human-readable)
  expiry: Date;
  daysToExpiry: number;
  poolKey?: string;
}

export interface PriceQuote {
  series: OptionSeries;
  unitPremium: number;   // per 1 underlying unit, USDC
  totalPremium: number;  // for desired size, USDC
  fee: number;           // platform fee, USDC
  iv: number;            // implied vol decimal
  greeks: Greeks;
  poolSpotPrice?: number;
  slippage?: number;
}

export interface Greeks {
  delta: number;    // ∂V/∂S
  gamma: number;    // ∂²V/∂S²
  theta: number;    // per day, USDC
  vega: number;     // per 1% vol, USDC
  rho?: number;
}

export interface Position {
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
  // Computed fields
  currentPremium?: number;
  pnl?: number;
  greeks?: Greeks;
  status: PositionStatus;
  isItm?: boolean;
}

export interface LPPosition {
  pubkey: string;
  pool: string;
  market: Market;
  optionType: OptionType;
  strike: number;
  expiry: Date;
  lpTokens: number;
  usdcDeposited: number;
  currentValue?: number;
  pnl?: number;
  sharePercent?: number;
}

// ── IV Surface ────────────────────────────────────────────────────────────────

export interface IVSurfacePoint {
  maturityDays: number;
  strikePct: number;
  iv: number;
  callPrice?: number;
  putPrice?: number;
  delta?: number;
  vega?: number;
}

export interface IVSurface {
  market: Market;
  spot: number;
  timestamp: number;
  params: {
    ivAtm: number;
    ivSkewRho: number;
    ivCurvaturePhi: number;
    thetaParam: number;
    realizedVol: number;
  };
  surface: IVSurfacePoint[];
}

// ── Trade Form ────────────────────────────────────────────────────────────────

export interface TradeFormState {
  market: Market;
  optionType: OptionType;
  strike: number;
  expiry: Date;
  size: number;
  slippageBps: number;
  action: 'buy' | 'sell';
}

// ── Notifications ─────────────────────────────────────────────────────────────

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  txSig?: string;
  timestamp: Date;
}

// ── Price feed ────────────────────────────────────────────────────────────────

export interface PriceFeed {
  market: string;   // any Pacifica symbol (BTC, ETH, NVDA, XAU, ...)
  price: number;
  bid: number;
  ask: number;
  change24h: number;
  volume24h: number;
  timestamp: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const SCALE = 1_000_000;
export const PLATFORM_FEE_BPS = 5;
export const SETTLEMENT_FEE_BPS = 5;
export const SETTLEMENT_FEE_CAP_USDC = 50;

export const MARKET_DISCRIMINANTS: Record<Market, number> = {
  // Crypto
  BTC: 0, ETH: 1, SOL: 2,
  // Equities
  NVDA: 3, TSLA: 4, PLTR: 5, CRCL: 6, HOOD: 7, SP500: 8,
  // Commodities
  XAU: 9, XAG: 10, PAXG: 11, PLATINUM: 12, NATGAS: 13, COPPER: 14,
};

export const OPTION_TYPE_DISCRIMINANTS: Record<OptionType, number> = {
  Call: 0,
  Put: 1,
};
