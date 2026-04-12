'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslation } from '@/contexts/LanguageContext';

type Section = 'overview' | 'architecture' | 'options' | 'nft' | 'hedging' | 'lp' | 'fees' | 'markets' | 'iv' | 'contracts';

function useSections() {
  const { t } = useTranslation();
  const SECTIONS: { id: Section; title: string }[] = [
    { id: 'overview',     title: t.docs.overview },
    { id: 'architecture', title: t.docs.architecture },
    { id: 'options',      title: t.docs.optionsTrading },
    { id: 'nft',          title: t.docs.nftPositions },
    { id: 'hedging',      title: t.docs.deltaHedging },
    { id: 'lp',           title: t.docs.lpVault },
    { id: 'fees',         title: t.docs.feeSchedule },
    { id: 'markets',      title: t.docs.markets },
    { id: 'iv',           title: t.docs.ivEngine },
    { id: 'contracts',    title: t.docs.smartContracts },
  ];
  return SECTIONS;
}

function SideNav({ active, onSelect, sections }: { active: Section; onSelect: (s: Section) => void; sections: { id: Section; title: string }[] }) {
  const { t } = useTranslation();
  return (
    <nav style={{
      width: 220, flexShrink: 0, padding: '24px 0',
      borderRight: '1px solid var(--border)',
      overflowY: 'auto',
    }}>
      <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px', marginBottom: 24 }}>
        <Image src="/logo.svg" alt="Abyssal" width={28} height={28} style={{ borderRadius: '50%' }} />
        <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>
          Abyssal<span style={{ color: 'var(--cyan)' }}>.fi</span>
        </span>
      </Link>
      <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0 20px', marginBottom: 12 }}>
        {t.docs.title}
      </div>
      {sections.map(s => (
        <button
          key={s.id}
          onClick={() => onSelect(s.id)}
          style={{
            display: 'block', width: '100%', textAlign: 'left',
            padding: '8px 20px', border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: active === s.id ? 600 : 400,
            color: active === s.id ? 'var(--cyan)' : 'var(--text2)',
            background: active === s.id ? 'var(--cyan-dim)' : 'transparent',
            borderLeft: active === s.id ? '2px solid var(--cyan)' : '2px solid transparent',
            transition: 'all 0.12s',
          }}
        >
          {s.title}
        </button>
      ))}
      <div style={{ padding: '20px', marginTop: 16, borderTop: '1px solid var(--border)' }}>
        <Link href="/app" style={{ fontSize: 12, color: 'var(--cyan)', textDecoration: 'none' }}>
          {t.common.backToApp}
        </Link>
      </div>
    </nav>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16, color: 'var(--text)', letterSpacing: '-0.01em' }}>{children}</h2>;
}
function H3({ children }: { children: React.ReactNode }) {
  return <h3 style={{ fontSize: 16, fontWeight: 600, marginTop: 24, marginBottom: 10, color: 'var(--text)' }}>{children}</h3>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 14 }}>{children}</p>;
}
function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre style={{
      background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6,
      padding: '14px 18px', fontSize: 12, fontFamily: 'var(--mono)',
      color: 'var(--text2)', overflowX: 'auto', marginBottom: 16, lineHeight: 1.6,
    }}>
      {children}
    </pre>
  );
}
function Li({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 14, color: 'var(--text2)', lineHeight: 1.6 }}>
      <span style={{ color: 'var(--cyan)', flexShrink: 0 }}>&#8226;</span>
      <span>{children}</span>
    </div>
  );
}

function OverviewSection() {
  return (<>
    <H2>Overview</H2>
    <P>
      Abyssal.fi is a decentralized on-chain options market built on Solana. It enables trading of European-style,
      cash-settled options on crypto, equities, and commodities. All options are settled in USDP (Pacifica stablecoin)
      and priced using the Black-Scholes model combined with the AFVR implied volatility surface.
    </P>
    <H3>Key Features</H3>
    <Li>European-style options (exercisable at expiry only)</Li>
    <Li>Cash-settled in USDP &mdash; no physical delivery</Li>
    <Li>15 markets: crypto (BTC, ETH, SOL), equities (NVDA, TSLA, PLTR, etc.), commodities (XAU, XAG, etc.)</Li>
    <Li>NFT-backed positions &mdash; each option position is represented by a unique on-chain NFT</Li>
    <Li>Automated delta hedging by the protocol</Li>
    <Li>LP vault for liquidity providers to earn fees</Li>
    <Li>Black-Scholes pricing with real-time Greeks</Li>
    <Li>Auto-faucet: 1000 USDP + SOL credited on first wallet connection (devnet)</Li>
  </>);
}

function ArchitectureSection() {
  return (<>
    <H2>Architecture</H2>
    <P>The protocol consists of three main components:</P>
    <H3>1. Solana Smart Contract (Anchor)</H3>
    <P>
      The core program deployed on Solana handles all on-chain state: vault management, option positions,
      AMM pools, IV oracles, and NFT minting/burning. All funds are held in the vault PDA.
    </P>
    <H3>2. Frontend (Next.js)</H3>
    <P>
      A responsive web application built with Next.js 14 App Router. Features include real-time pricing,
      TradingView chart integration, option builder with payoff visualization, portfolio tracking,
      and LP vault management.
    </P>
    <H3>3. IV Engine (Python Keeper)</H3>
    <P>
      A background service that computes implied volatility parameters using the AFVR model,
      settles expired options, and manages delta hedging. Price feeds come from CoinGecko (crypto)
      and simulated random walks (equities/commodities).
    </P>
    <Code>{`Frontend (Next.js)
    |
    v
Anchor Program (Solana)
    |
    +-- OptionVault (global state)
    +-- AmmPool (per-series liquidity)
    +-- OptionPosition (per-user)
    +-- IVOracle (per-market)
    +-- NFT Mint (per-position)
    |
IV Engine (Python)
    |
    +-- AFVR Calculator
    +-- Settlement Loop
    +-- Delta Hedge Loop`}</Code>
  </>);
}

function OptionsSection() {
  return (<>
    <H2>Options Trading</H2>
    <H3>How It Works</H3>
    <P>
      When you buy an option on Abyssal.fi, the following happens atomically in a single Solana transaction:
    </P>
    <Li>The premium (calculated via Black-Scholes) is transferred from your wallet to the vault</Li>
    <Li>An OptionPosition account is created/updated on-chain</Li>
    <Li>An NFT is minted to your wallet as proof of position ownership</Li>
    <Li>The protocol initiates a delta hedge to offset risk</Li>
    <H3>Option Parameters</H3>
    <Li><strong>Strike Prices:</strong> 6 strikes around ATM (-10%, -5%, ATM, +5%, +10%, +20%)</Li>
    <Li><strong>Expiries:</strong> 1D, 3D, 7D, 14D, 30D</Li>
    <Li><strong>Types:</strong> Calls and Puts</Li>
    <Li><strong>Size:</strong> Denominated in underlying units</Li>
    <H3>Exercising Options</H3>
    <P>
      Options are European-style: they can only be exercised at expiry. The settlement keeper
      automatically processes expired options. If an option is in-the-money (ITM), the payoff
      is calculated and credited to the position holder. The NFT is burned upon settlement.
    </P>
    <Code>{`Call Payoff = max(0, Spot - Strike) × Size
Put  Payoff = max(0, Strike - Spot) × Size`}</Code>
  </>);
}

function NftSection() {
  return (<>
    <H2>NFT Positions</H2>
    <P>
      Every option position on Abyssal.fi is backed by a unique on-chain NFT. This provides
      cryptographic proof of ownership and enables seamless position transfers.
    </P>
    <H3>Lifecycle</H3>
    <Li><strong>Mint:</strong> When you buy an option, an NFT is minted to your wallet in the same transaction. The NFT contains metadata about the position (market, strike, expiry, size).</Li>
    <Li><strong>Hold:</strong> The NFT sits in your wallet as proof of your option position. It is visible in Phantom, Solflare, and other Solana wallets.</Li>
    <Li><strong>Transfer (Sell):</strong> When you sell your position, the NFT automatically transfers to the new owner. The on-chain position account updates its owner reference accordingly.</Li>
    <Li><strong>Burn (Settlement):</strong> When the option expires and is settled, the NFT is burned. If the option was ITM, the payoff is sent to the NFT holder&apos;s wallet.</Li>
    <H3>Why NFTs?</H3>
    <Li>On-chain proof of position ownership</Li>
    <Li>Composable with other DeFi protocols</Li>
    <Li>Enables P2P position marketplace</Li>
    <Li>Transparent and auditable on Solscan</Li>
  </>);
}

function HedgingSection() {
  return (<>
    <H2>Delta Hedging</H2>
    <P>
      Abyssal.fi employs automatic delta hedging to manage the protocol&apos;s risk exposure when users
      trade options. This protects LP funds from directional market moves.
    </P>
    <H3>How It Works</H3>
    <P>
      When a user buys a <strong>call option</strong>, the protocol takes a corresponding <strong>long position</strong> in
      the underlying asset using funds from the vault. This offsets the protocol&apos;s short delta exposure.
      Conversely, when a user buys a <strong>put option</strong>, the protocol takes a <strong>short position</strong>.
    </P>
    <Code>{`User buys Call  →  Protocol goes Long  (buys underlying)
User buys Put   →  Protocol goes Short (sells underlying)
User sells Call →  Protocol closes Long
User sells Put  →  Protocol closes Short`}</Code>
    <H3>Funding the Hedge</H3>
    <Li>Hedge positions are funded from the vault&apos;s USDP collateral</Li>
    <Li>The premium collected from option buyers partially funds the hedge</Li>
    <Li>Hedge P&L flows back to the vault, affecting the vLP token price</Li>
    <H3>LP Economics</H3>
    <P>LPs earn revenue from two sources:</P>
    <Li><strong>Trading fees:</strong> 0.05% (5 bps) of every option premium</Li>
    <Li><strong>Unexercised premiums:</strong> When options expire OTM, the full premium stays in the vault</Li>
    <P>
      The hedge ensures that ITM option payoffs are backed by corresponding gains in the hedge position.
      LPs are therefore primarily exposed to the spread between collected premiums and hedging costs,
      not to directional market risk.
    </P>
  </>);
}

function LpSection() {
  return (<>
    <H2>LP Vault</H2>
    <P>
      The LP Vault is the protocol&apos;s central liquidity pool. LPs deposit USDP and receive vLP
      (vault LP) tokens representing their share of the pool.
    </P>
    <H3>How vLP Works</H3>
    <Li>Deposit USDP &rarr; receive vLP SPL tokens (visible in Phantom, transferable wallet-to-wallet)</Li>
    <Li>The vault underwrites all options. Premiums collected increase the vLP price</Li>
    <Li>vLP price = Total Collateral &divide; Total vLP Supply</Li>
    <Li>To withdraw: burn vLP tokens &rarr; receive proportional USDP</Li>
    <Li>Withdrawals are subject to a solvency check (120% OI coverage)</Li>
    <H3>Risk</H3>
    <P>
      LPs take on the residual risk of the vault. While delta hedging neutralizes most directional
      risk, LPs are exposed to: hedging slippage, basis risk between hedge and options, and extreme
      market moves that exceed the hedge&apos;s capacity.
    </P>
  </>);
}

function FeesSection() {
  return (<>
    <H2>Fee Schedule</H2>
    <Code>{`Event              Fee
─────────────────  ─────────────────────────────────
Buy / Sell         0.05% (5 bps) of premium
Exercise (ITM)     0.05% of payoff, capped at 50 USDC
Exercise (OTM)     0%`}</Code>
    <P>
      All fees are collected by the vault and accrue to vLP holders. The fee parameters are defined
      in the smart contract and can be updated by the protocol authority.
    </P>
  </>);
}

function MarketsSection() {
  return (<>
    <H2>Markets</H2>
    <P>Abyssal.fi supports 15 markets across three asset classes:</P>
    <H3>Crypto</H3>
    <Code>{`BTC  (Bitcoin)     — Disc: 0
ETH  (Ethereum)    — Disc: 1
SOL  (Solana)      — Disc: 2`}</Code>
    <H3>Equities</H3>
    <Code>{`NVDA  (Nvidia)     — Disc: 3
TSLA  (Tesla)      — Disc: 4
PLTR  (Palantir)   — Disc: 5
CRCL  (Circle)     — Disc: 6
HOOD  (Robinhood)  — Disc: 7
SP500 (S&P 500)    — Disc: 8`}</Code>
    <H3>Commodities</H3>
    <Code>{`XAU      (Gold)     — Disc: 9
XAG      (Silver)   — Disc: 10
PAXG     (PAX Gold) — Disc: 11
PLATINUM             — Disc: 12
NATGAS   (Nat Gas)  — Disc: 13
COPPER               — Disc: 14`}</Code>
  </>);
}

function IvSection() {
  return (<>
    <H2>IV Engine</H2>
    <P>
      The implied volatility engine uses the AFVR (Asymmetric Funding-Adjusted Volatility with
      Risk-reversal) model to compute the volatility surface for each market.
    </P>
    <H3>Parameters</H3>
    <Li><strong>iv_atm:</strong> At-the-money implied volatility</Li>
    <Li><strong>iv_skew_rho:</strong> Skew parameter (put-call asymmetry)</Li>
    <Li><strong>iv_curvature_phi:</strong> Curvature parameter (smile shape)</Li>
    <Li><strong>theta_param:</strong> Term structure parameter</Li>
    <H3>Update Cycle</H3>
    <P>
      The keeper service updates IV parameters every 300 seconds by computing AFVR parameters
      from current market data. These parameters are written to on-chain IVOracle accounts,
      which the smart contract reads during option pricing.
    </P>
    <H3>Price Feeds</H3>
    <Li><strong>Crypto:</strong> CoinGecko API (live prices every 20s)</Li>
    <Li><strong>Equities & Commodities:</strong> Simulated random walk with realistic parameters</Li>
  </>);
}

function ContractsSection() {
  return (<>
    <H2>Smart Contracts</H2>
    <H3>Program ID</H3>
    <Code>CBkvR8SeN6j8RQKB7dSxG3dza2v71XHmWEe8LgfMW1hG</Code>
    <H3>Key Accounts (Devnet)</H3>
    <Code>{`Vault PDA:       FApkeXy7k4yoLgDbWkJvEYi8pJsq9JJia8NMkinCYpDd
Vault USDC:      4V3a9TiePG2mAMC8tdkcCrLaTe3HCaaYfUWqKr7XQbev
vLP Mint:        4swq2n3c9SeJHRLvz6NcuYkUVwxGVPgF5m2ELzAHPzzU
USDC Mint:       HC53kut48rC2raro2XkuzmQD1g4MA3XgDK1HtfCfXf6k`}</Code>
    <H3>PDA Seeds</H3>
    <Code>{`Vault:      ["vault",      authority]
VaultUSDC:  ["vault_usdc", vault]
IVOracle:   ["iv_oracle",  vault, market_disc (1 byte)]
AmmPool:    ["amm_pool",   vault, market_disc, option_type_disc, strike (le8), expiry (le8)]
Position:   ["position",   owner, vault, market_disc, option_type_disc, strike (le8), expiry (le8)]
LPPosition: ["lp_position", owner, pool]
OptionNFT:  ["option_nft",  position]`}</Code>
    <H3>Instructions</H3>
    <Li><strong>initialize_vault</strong> / pause_vault / unpause_vault</Li>
    <Li><strong>update_iv_params</strong> / initialize_iv_oracle</Li>
    <Li><strong>ensure_series</strong> &mdash; idempotent AMM pool + position init</Li>
    <Li><strong>buy_option</strong> &mdash; purchase option, pay premium</Li>
    <Li><strong>mint_option_nft</strong> &mdash; mint NFT proof of position</Li>
    <Li><strong>sell_option</strong> &mdash; sell position, burn/transfer NFT</Li>
    <Li><strong>exercise_option</strong> &mdash; settle ITM option, burn NFT</Li>
    <Li><strong>settle_expired</strong> &mdash; settle all expired positions</Li>
    <Li><strong>rebalance_delta</strong> &mdash; adjust hedge positions</Li>
    <Li><strong>add_liquidity</strong> / remove_liquidity / deposit_vault / withdraw_vault</Li>
  </>);
}

const SECTION_COMPONENTS: Record<Section, React.FC> = {
  overview: OverviewSection,
  architecture: ArchitectureSection,
  options: OptionsSection,
  nft: NftSection,
  hedging: HedgingSection,
  lp: LpSection,
  fees: FeesSection,
  markets: MarketsSection,
  iv: IvSection,
  contracts: ContractsSection,
};

export default function DocsPage() {
  const [section, setSection] = useState<Section>('overview');
  const sections = useSections();
  const Content = SECTION_COMPONENTS[section];

  return (
    <div style={{
      height: '100dvh', display: 'flex', overflow: 'hidden',
      background: 'var(--bg)', color: 'var(--text)',
      fontFamily: 'var(--font)',
    }}>
      <SideNav active={section} onSelect={setSection} sections={sections} />
      <main style={{
        flex: 1, overflowY: 'auto', padding: '40px 48px',
        maxWidth: 800,
      }}>
        <Content />
      </main>
    </div>
  );
}
