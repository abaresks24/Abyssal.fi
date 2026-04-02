'use client';
import React, { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Area, AreaChart,
  BarChart, Bar, Cell,
} from 'recharts';

// ── Types ─────────────────────────────────────────────────────────────────────

type Section =
  | 'overview'
  | 'options-101'
  | 'amm'
  | 'pricing'
  | 'marketplace'
  | 'greeks'
  | 'fees'
  | 'architecture'
  | 'faq';

const SECTIONS: { id: Section; label: string; icon: string }[] = [
  { id: 'overview',     label: 'Protocol Overview',    icon: '◈' },
  { id: 'options-101',  label: 'Options 101',          icon: '◉' },
  { id: 'amm',          label: 'AMM Liquidity',        icon: '⇌' },
  { id: 'pricing',      label: 'Black-Scholes Pricing',icon: '∫' },
  { id: 'marketplace',  label: 'P2P Marketplace',      icon: '⇄' },
  { id: 'greeks',       label: 'Greeks & Risk',        icon: 'Δ' },
  { id: 'fees',         label: 'Fee Schedule',         icon: '%' },
  { id: 'architecture', label: 'Architecture',         icon: '⬡' },
  { id: 'faq',          label: 'FAQ',                  icon: '?' },
];

// ── Colour palette ────────────────────────────────────────────────────────────

const C = {
  cyan:   '#55c3e9',
  green:  '#02c77b',
  red:    '#eb365a',
  yellow: '#ecca5a',
  bg:     '#0a121c',
  bg1:    '#0c1820',
  bg2:    '#111d2a',
  border: 'rgba(255,255,255,0.10)',
  text:   '#ffffff',
  text2:  '#c8d8e8',
  text3:  '#8898a8',
};

// ── Shared sub-components ─────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 8, letterSpacing: '-0.02em' }}>
      {children}
    </h2>
  );
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ fontSize: 15, fontWeight: 600, color: C.cyan, marginBottom: 6, marginTop: 24 }}>
      {children}
    </h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 13.5, lineHeight: 1.75, color: C.text2, marginBottom: 12 }}>
      {children}
    </p>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code style={{
      background: C.bg2, border: `1px solid ${C.border}`,
      borderRadius: 4, padding: '1px 6px', fontSize: 12,
      fontFamily: 'JetBrains Mono, monospace', color: C.cyan,
    }}>
      {children}
    </code>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: 20 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {headers.map(h => (
              <th key={h} style={{
                textAlign: 'left', padding: '8px 12px',
                borderBottom: `1px solid ${C.border}`,
                color: C.text3, fontWeight: 600, fontSize: 12,
                background: C.bg2,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} style={{
                  padding: '9px 12px',
                  borderBottom: `1px solid ${C.border}`,
                  color: C.text2,
                }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InfoBox({ color = C.cyan, children }: { color?: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: `${color}10`,
      border: `1px solid ${color}30`,
      borderRadius: 8, padding: '12px 16px',
      marginBottom: 16, fontSize: 13, color: C.text2, lineHeight: 1.65,
    }}>
      {children}
    </div>
  );
}

function FlowStep({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', background: `${C.cyan}20`,
        border: `1px solid ${C.cyan}60`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: C.cyan, fontWeight: 700, fontSize: 12, flexShrink: 0, marginTop: 1,
      }}>{n}</div>
      <div>
        <div style={{ fontWeight: 600, fontSize: 13, color: C.text, marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 12.5, color: C.text3, lineHeight: 1.6 }}>{desc}</div>
      </div>
    </div>
  );
}

// ── Payoff diagram ────────────────────────────────────────────────────────────

function PayoffDiagram({ strike = 100, premium = 8, type = 'call' as 'call' | 'put' }) {
  const data = useMemo(() => {
    const pts = [];
    for (let S = 50; S <= 160; S += 2) {
      const intrinsic = type === 'call'
        ? Math.max(0, S - strike)
        : Math.max(0, strike - S);
      const pnl = intrinsic - premium;
      pts.push({ S, intrinsic, pnl, breakeven: 0 });
    }
    return pts;
  }, [strike, premium, type]);

  const be = type === 'call' ? strike + premium : strike - premium;

  return (
    <div>
      <div style={{ fontSize: 12, color: C.text3, marginBottom: 8 }}>
        <span style={{ color: C.text }}>{type === 'call' ? 'Long Call' : 'Long Put'}</span>
        {' — '} Strike <span style={{ color: C.cyan }}>${strike}</span>,
        Premium <span style={{ color: C.yellow }}>${premium}</span>,
        Breakeven <span style={{ color: C.green }}>${be}</span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={C.green} stopOpacity={0.3} />
              <stop offset="95%" stopColor={C.green} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="lossGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={C.red} stopOpacity={0} />
              <stop offset="95%" stopColor={C.red} stopOpacity={0.25} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
          <XAxis dataKey="S" tick={{ fill: C.text3, fontSize: 11 }} tickFormatter={v => `$${v}`} />
          <YAxis tick={{ fill: C.text3, fontSize: 11 }} tickFormatter={v => `$${v}`} />
          <Tooltip
            contentStyle={{ background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 6 }}
            labelStyle={{ color: C.text, fontSize: 12 }}
            formatter={(val: number) => [`$${val.toFixed(2)}`, 'P&L']}
            labelFormatter={(v: number) => `Spot: $${v}`}
          />
          <ReferenceLine y={0} stroke={C.text3} strokeDasharray="4 4" />
          <ReferenceLine x={be} stroke={C.green} strokeDasharray="4 4" label={{ value: `BE $${be}`, fill: C.green, fontSize: 10 }} />
          <ReferenceLine x={strike} stroke={C.yellow} strokeDasharray="4 4" label={{ value: `K $${strike}`, fill: C.yellow, fontSize: 10 }} />
          <Area type="monotone" dataKey="pnl" stroke={C.cyan} strokeWidth={2}
            fill="url(#profitGrad)" dot={false} activeDot={{ r: 3 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── IV Surface mini chart ─────────────────────────────────────────────────────

function IVSkewChart() {
  const data = useMemo(() => {
    const pts = [];
    for (let m = 0.6; m <= 1.4; m += 0.05) {
      const moneyness = m;
      const iv = 0.35 + 0.12 * Math.pow(moneyness - 1.05, 2) - 0.05 * (moneyness - 1);
      pts.push({ moneyness: m.toFixed(2), iv: +(iv * 100).toFixed(1) });
    }
    return pts;
  }, []);

  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="ivGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={C.cyan} stopOpacity={0.3} />
            <stop offset="95%" stopColor={C.cyan} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
        <XAxis dataKey="moneyness" tick={{ fill: C.text3, fontSize: 11 }}
          tickFormatter={v => `${(parseFloat(v) * 100).toFixed(0)}%`} />
        <YAxis tick={{ fill: C.text3, fontSize: 11 }} tickFormatter={v => `${v}%`} />
        <Tooltip
          contentStyle={{ background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 6 }}
          formatter={(val: number) => [`${val}%`, 'IV']}
          labelFormatter={(v: string) => `Moneyness: ${(parseFloat(v) * 100).toFixed(0)}%`}
        />
        <Area type="monotone" dataKey="iv" stroke={C.cyan} strokeWidth={2}
          fill="url(#ivGrad)" dot={false} />
        <ReferenceLine x="1.00" stroke={C.yellow} strokeDasharray="4 4" label={{ value: 'ATM', fill: C.yellow, fontSize: 10 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Greeks chart ─────────────────────────────────────────────────────────────

function DeltaChart() {
  const data = useMemo(() => {
    const pts = [];
    for (let S = 60; S <= 160; S += 2) {
      const x = (S - 100) / 20;
      const callDelta = 1 / (1 + Math.exp(-x * 1.2));
      const putDelta  = callDelta - 1;
      pts.push({ S, callDelta: +callDelta.toFixed(3), putDelta: +putDelta.toFixed(3) });
    }
    return pts;
  }, []);

  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
        <XAxis dataKey="S" tick={{ fill: C.text3, fontSize: 11 }} tickFormatter={v => `$${v}`} />
        <YAxis domain={[-1, 1]} tick={{ fill: C.text3, fontSize: 11 }} />
        <Tooltip
          contentStyle={{ background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 6 }}
          formatter={(val: number, name: string) => [val.toFixed(3), name === 'callDelta' ? 'Call Δ' : 'Put Δ']}
        />
        <ReferenceLine y={0} stroke={C.text3} strokeDasharray="4 4" />
        <ReferenceLine x={100} stroke={C.yellow} strokeDasharray="4 4" />
        <Line type="monotone" dataKey="callDelta" stroke={C.cyan} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="putDelta" stroke={C.red} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── AMM k-invariant visual ────────────────────────────────────────────────────

function AmmCurveChart() {
  const data = useMemo(() => {
    const K = 10000;
    const pts = [];
    for (let x = 10; x <= 200; x += 5) {
      pts.push({ options: x, usdc: +(K / x).toFixed(1) });
    }
    return pts;
  }, []);

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="ammGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={C.yellow} stopOpacity={0.25} />
            <stop offset="95%" stopColor={C.yellow} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
        <XAxis dataKey="options" tick={{ fill: C.text3, fontSize: 11 }} label={{ value: 'Options Reserve', fill: C.text3, fontSize: 11, position: 'insideBottom', offset: -2 }} />
        <YAxis tick={{ fill: C.text3, fontSize: 11 }} label={{ value: 'USDC Reserve', fill: C.text3, fontSize: 11, angle: -90, position: 'insideLeft', offset: 20 }} />
        <Tooltip
          contentStyle={{ background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 6 }}
          formatter={(val: number, name: string) => [val, name === 'usdc' ? 'USDC' : 'Options']}
          labelFormatter={(v: number) => `Options: ${v}`}
        />
        <Area type="monotone" dataKey="usdc" stroke={C.yellow} strokeWidth={2}
          fill="url(#ammGrad)" dot={false} />
        <ReferenceLine x={100} stroke={C.green} strokeDasharray="4 4"
          label={{ value: 'Current', fill: C.green, fontSize: 10 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Section renderers ─────────────────────────────────────────────────────────

function Overview() {
  return (
    <div>
      <SectionTitle>Protocol Overview</SectionTitle>
      <P>
        Abyssal.fi is a fully on-chain, non-custodial options protocol on Solana. It lets any user
        buy, sell, or write European cash-settled options on crypto assets, equities, and commodities
        — all settled in USDC with no off-chain intermediary.
      </P>

      <InfoBox color={C.cyan}>
        <strong style={{ color: C.cyan }}>European cash-settled</strong> — options can only be exercised at expiry.
        Payoff is paid in USDC; no physical delivery of the underlying occurs on-chain.
      </InfoBox>

      <SubTitle>High-level flow</SubTitle>
      <FlowStep n={1} title="Price discovery" desc="A keeper daemon continuously updates the AFVR IV surface on-chain from live Pacifica perpetual prices and historical realized volatility data." />
      <FlowStep n={2} title="Buy / Sell via AMM" desc="Users trade options against a constant-product AMM pool. Each (market, option type, strike, expiry) pair has its own pool. The protocol vault acts as ultimate backstop." />
      <FlowStep n={3} title="Position NFT (PDA)" desc="Each trade creates or updates an on-chain OptionPosition account derived from the user's wallet + series parameters. This PDA is the user's proof of ownership." />
      <FlowStep n={4} title="Settlement at expiry" desc="At expiry the keeper (or anyone permissionlessly) calls settle_expired. The vault pays out ITM payoffs from its USDC reserves and collects a 5 bps fee." />
      <FlowStep n={5} title="P2P Marketplace" desc="Users may list their positions for resale, or write entirely new options by locking their own USDC collateral as counterparty." />

      <SubTitle>Supported markets</SubTitle>
      <Table
        headers={['Category', 'Underlyings']}
        rows={[
          ['Crypto',       'BTC, ETH, SOL'],
          ['Equities',     'NVDA, TSLA, PLTR, CRCL, HOOD, SP500'],
          ['Commodities',  'XAU (Gold), XAG (Silver), PAXG, Platinum, NatGas, Copper'],
        ]}
      />
    </div>
  );
}

function Options101() {
  const [view, setView] = useState<'call' | 'put'>('call');

  return (
    <div>
      <SectionTitle>Options 101</SectionTitle>
      <P>
        An option is a contract that grants the right — but not the obligation — to receive a payoff
        based on the price of an underlying asset at a specific future date (the <em>expiry</em>).
      </P>

      <SubTitle>Call vs Put</SubTitle>
      <Table
        headers={['', 'Call', 'Put']}
        rows={[
          ['Right',   'Receive payoff if asset > strike',   'Receive payoff if asset < strike'],
          ['Payoff',  'max(S − K, 0)',                       'max(K − S, 0)'],
          ['Bet',     'Bullish (price goes up)',             'Bearish (price goes down)'],
          ['Max loss','Premium paid',                        'Premium paid'],
          ['Max gain','Unlimited',                          'Strike − Premium (bounded)'],
        ]}
      />

      <SubTitle>Payoff diagram</SubTitle>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {(['call', 'put'] as const).map(t => (
          <button key={t} onClick={() => setView(t)} style={{
            padding: '4px 14px', borderRadius: 6, border: `1px solid ${view === t ? C.cyan : C.border}`,
            background: view === t ? `${C.cyan}15` : 'transparent',
            color: view === t ? C.cyan : C.text3, fontSize: 12, cursor: 'pointer',
          }}>
            {t === 'call' ? 'Call' : 'Put'}
          </button>
        ))}
      </div>
      <PayoffDiagram type={view} />

      <SubTitle>Key terms</SubTitle>
      <Table
        headers={['Term', 'Definition']}
        rows={[
          ['Strike (K)',    'The reference price for computing the payoff'],
          ['Expiry',        'The Unix timestamp at which the option can be settled'],
          ['Premium',       'The price paid upfront to buy the option (in USDC)'],
          ['ITM',          'In-the-money — intrinsic value > 0'],
          ['OTM',          'Out-of-the-money — intrinsic value = 0'],
          ['ATM',          'At-the-money — spot ≈ strike'],
          ['Intrinsic value','The payoff if exercised right now'],
          ['Time value',    'Premium − intrinsic; decays to 0 at expiry (theta)'],
        ]}
      />

      <SubTitle>Why trade options?</SubTitle>
      <P>
        Options offer <strong>leverage</strong> without liquidation risk — your maximum loss is always the premium paid.
        They can be used to hedge an existing position, speculate directionally with defined risk,
        or express a view on volatility itself (buying options benefits from IV expansion).
      </P>
    </div>
  );
}

function AmmSection() {
  return (
    <div>
      <SectionTitle>AMM Liquidity</SectionTitle>
      <P>
        Abyssal uses a <strong>constant-product AMM</strong> (x · y = k) for each options series.
        Liquidity providers deposit USDC; the vault mints virtual option inventory on the other side.
        Buyers trade against the pool; sellers return options to it.
      </P>

      <SubTitle>Pool structure</SubTitle>
      <InfoBox color={C.yellow}>
        One pool per <Code>(market, option_type, strike, expiry)</Code>. Pools are completely
        independent — SOL $200 Call 30-Jun and SOL $200 Call 15-Jul are separate pools.
      </InfoBox>

      <SubTitle>The xy = k invariant</SubTitle>
      <P>
        Let <Code>x = reserve_options</Code> and <Code>y = reserve_usdc</Code>. After every trade
        the product <Code>k = x · y</Code> must be preserved (minus fees).
        This guarantees infinite liquidity at a price but with increasing slippage for large trades.
      </P>
      <AmmCurveChart />

      <SubTitle>Adding liquidity</SubTitle>
      <FlowStep n={1} title="Deposit USDC" desc="LP calls add_liquidity with a USDC amount. The AMM credits proportional LP tokens." />
      <FlowStep n={2} title="LP token receipt" desc="LP tokens represent a share of the pool's total value (options + USDC). They auto-accumulate fees." />
      <FlowStep n={3} title="Remove anytime" desc="LP calls remove_liquidity to burn LP tokens and receive proportional USDC." />

      <SubTitle>Impermanent loss & risk</SubTitle>
      <P>
        Unlike token AMMs, option AMMs carry a directional risk because option prices are
        asymmetric. The vault delta-hedges its aggregate exposure via Pacifica perpetuals,
        partially offsetting this risk for LPs. LPs earn the bid-ask spread embedded in the
        constant-product pricing curve.
      </P>

      <SubTitle>Global vault as backstop</SubTitle>
      <P>
        Beyond per-series AMM pools, a global vault holds protocol-level USDC from <strong>vLP depositors</strong>.
        This backstop collateral is available for large exercises that would otherwise drain a pool.
        vLP holders earn a proportional share of all protocol fees.
      </P>
    </div>
  );
}

function PricingSection() {
  return (
    <div>
      <SectionTitle>Black-Scholes Pricing</SectionTitle>
      <P>
        Options are priced using the <strong>Black-Scholes formula</strong> adapted for European
        cash-settled instruments. The IV input comes from the on-chain <strong>AFVR surface</strong>
        maintained by the keeper daemon.
      </P>

      <SubTitle>Black-Scholes formula</SubTitle>
      <div style={{
        background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8,
        padding: '16px 20px', marginBottom: 16, fontFamily: 'JetBrains Mono, monospace',
        fontSize: 13, color: C.text2, lineHeight: 2,
      }}>
        <div><span style={{ color: C.cyan }}>d₁</span> = (ln(S/K) + (r + σ²/2)·T) / (σ·√T)</div>
        <div><span style={{ color: C.cyan }}>d₂</span> = d₁ − σ·√T</div>
        <div style={{ marginTop: 8 }}>
          <span style={{ color: C.green }}>Call</span> = S·N(d₁) − K·e<sup>-rT</sup>·N(d₂)
        </div>
        <div>
          <span style={{ color: C.red }}>Put</span>  = K·e<sup>-rT</sup>·N(−d₂) − S·N(−d₁)
        </div>
      </div>
      <Table
        headers={['Symbol', 'Meaning', 'Source']}
        rows={[
          ['S', 'Current spot price', 'Pacifica oracle / keeper'],
          ['K', 'Strike price', 'User-chosen at trade time'],
          ['T', 'Time to expiry (years)', 'Computed from block timestamp'],
          ['σ', 'Implied volatility (IV)', 'AFVR IV surface oracle'],
          ['r', 'Risk-free rate', 'Hardcoded at 0% (crypto convention)'],
          ['N(·)', 'Normal CDF', 'Fixed-point approximation on-chain'],
        ]}
      />

      <SubTitle>AFVR IV surface</SubTitle>
      <P>
        The <strong>Asymmetric Funding-Adjusted Volatility with Risk-reversal (AFVR)</strong> model
        captures the characteristic smile / skew of crypto options. Four parameters per market are
        stored on-chain in the <Code>IVOracle</Code> account:
      </P>
      <Table
        headers={['Param', 'Role']}
        rows={[
          ['iv_atm',           'ATM implied volatility'],
          ['iv_skew_rho',      'Risk-reversal (call vs put asymmetry)'],
          ['iv_curvature_phi', 'Wings — how much smile curves away from ATM'],
          ['theta_param',      'Funding-rate adjustment for perp basis'],
        ]}
      />

      <SubTitle>IV skew shape</SubTitle>
      <IVSkewChart />
      <P>
        Puts (left wing, low moneyness) typically trade at a premium vs calls due to demand for
        downside protection — this is captured by <Code>iv_skew_rho</Code>.
      </P>

      <SubTitle>Fixed-point arithmetic</SubTitle>
      <P>
        All on-chain math uses <Code>SCALE = 1_000_000</Code> (6 decimals). A premium of 5 USDC
        is stored as <Code>5_000_000</Code>. An IV of 80% is stored as <Code>800_000</Code>.
        The Black-Scholes implementation avoids floating-point entirely using integer sqrt,
        ln, and exp approximations.
      </P>
    </div>
  );
}

function MarketplaceSection() {
  return (
    <div>
      <SectionTitle>P2P Marketplace</SectionTitle>
      <P>
        The protocol does not buy back options it has sold. Instead, Abyssal provides a
        <strong> permissionless P2P marketplace</strong> where users can transfer positions
        to each other — or write entirely new options by locking their own collateral.
      </P>

      <SubTitle>Resale listings — transfer a position</SubTitle>
      <FlowStep n={1} title="Seller lists" desc="Any holder calls list_for_resale, specifying the series and size they want to sell and an ask price in USDC. The listing PDA is created on-chain." />
      <FlowStep n={2} title="Buyer fills" desc="Any buyer calls fill_resale_listing, paying the ask price directly to the seller. The buyer's OptionPosition is created (or increased) with the transferred size." />
      <FlowStep n={3} title="Seller's position decreases" desc="Simultaneously, the seller's OptionPosition size is decreased by the sold size. No protocol involvement — pure P2P." />
      <FlowStep n={4} title="Expiry settlement" desc="The buyer's new OptionPosition settles through the protocol vault exactly like any other protocol-bought position." />

      <InfoBox color={C.green}>
        <strong style={{ color: C.green }}>Price discovery</strong> — the ask price is set by the seller.
        The buyer can compare with the live Black-Scholes preview to assess fair value.
      </InfoBox>

      <SubTitle>Written listings — write a new option</SubTitle>
      <P>
        A <em>writer</em> creates a brand-new option series by locking their own USDC collateral.
        The protocol plays no role in the payoff — the writer IS the counterparty.
      </P>
      <FlowStep n={1} title="Writer locks collateral" desc="Writer calls write_option_listing. Collateral is calculated as: Puts → strike × size; Calls → 2 × spot × size. USDC is locked in an escrow PDA." />
      <FlowStep n={2} title="Buyer fills" desc="Buyer calls fill_written_listing, pays the ask price to the writer. A WrittenPosition PDA is created for the buyer." />
      <FlowStep n={3} title="Settlement at expiry" desc="Anyone calls settle_written_option (permissionless). Payoff is paid to the buyer from escrow; remainder returned to writer." />

      <SubTitle>Collateral rules</SubTitle>
      <Table
        headers={['Option', 'Required collateral', 'Rationale']}
        rows={[
          ['Put',  'strike × size / SCALE',      'Worst case: asset goes to 0, writer pays full strike'],
          ['Call', '2 × spot × size / SCALE',    'Conservative: buffers for large upward moves'],
        ]}
      />

      <SubTitle>Settlement for written options</SubTitle>
      <P>
        Settlement uses the same oracle freshness and price validation as the main protocol
        (±5% tolerance against the on-chain IV oracle's latest price). Fee schedule is identical:
        5 bps of payoff, capped at 50 USDC.
      </P>

      <InfoBox color={C.yellow}>
        <strong style={{ color: C.yellow }}>Important:</strong> Written option listings are never
        fully closed on-chain until settlement — the listing PDA stays alive so the escrow USDC
        account can be derived at settlement time. After settlement the listing PDA is closed and
        rent returned to the writer.
      </InfoBox>
    </div>
  );
}

function GreeksSection() {
  return (
    <div>
      <SectionTitle>Greeks & Risk</SectionTitle>
      <P>
        Greeks measure the sensitivity of an option's price to changes in market parameters.
        The protocol computes them for UI display; they are not stored on-chain.
      </P>

      <SubTitle>Delta (Δ) — price sensitivity</SubTitle>
      <P>
        Delta measures how much the option premium changes for a $1 move in the underlying.
        Call delta ∈ [0, 1]; Put delta ∈ [−1, 0]. ATM options have Δ ≈ ±0.5.
      </P>
      <DeltaChart />

      <SubTitle>Summary table</SubTitle>
      <Table
        headers={['Greek', 'Symbol', 'Sensitivity to', 'Typical range']}
        rows={[
          ['Delta', 'Δ', 'Spot price ±$1',       'Call: 0→1  /  Put: −1→0'],
          ['Gamma', 'Γ', 'Delta per $1 spot move','Highest ATM, near expiry'],
          ['Vega',  'ν', 'IV change (1%)',         'Long option: positive'],
          ['Theta', 'Θ', 'Time decay (per day)',   'Long option: negative'],
          ['Rho',   'ρ', 'Risk-free rate (1%)',    'Near zero (r=0 assumed)'],
        ]}
      />

      <SubTitle>Delta hedging — how the protocol manages risk</SubTitle>
      <P>
        When the AMM sells options to users, the protocol accumulates a net <strong>negative delta</strong>
        (it is short options). The keeper daemon periodically calls <Code>rebalance_delta</Code>,
        which trades Pacifica perpetuals to bring net delta toward zero.
      </P>

      <FlowStep n={1} title="Measure net delta" desc="Sum over all open positions: Σ(size_i × delta_i). This is the vault's aggregate directional exposure." />
      <FlowStep n={2} title="Compute hedge" desc="If net delta = −120, the protocol needs to long 120 units of perpetual to neutralize." />
      <FlowStep n={3} title="Execute via Pacifica" desc="rebalance_delta emits the required trade instruction to the Pacifica perp protocol." />
      <FlowStep n={4} title="Residual risk" desc="Between rebalances, the vault carries gamma risk. Frequent rebalances reduce P&L variance at the cost of transaction fees." />

      <InfoBox color={C.red}>
        <strong style={{ color: C.red }}>Risk disclosure:</strong> Delta hedging does not eliminate risk.
        Gamma, vega, and gap risk remain. Users should understand that AMM LPs can lose money
        if realized volatility significantly exceeds implied volatility (the protocol sold IV too cheaply).
      </InfoBox>
    </div>
  );
}

function FeesSection() {
  const feeData = [
    { name: 'Buy (5 bps)', value: 5, color: C.cyan },
    { name: 'Sell (5 bps)', value: 5, color: C.cyan },
    { name: 'Exercise ITM (5 bps)', value: 5, color: C.green },
    { name: 'Exercise OTM', value: 0, color: C.text3 },
  ];

  return (
    <div>
      <SectionTitle>Fee Schedule</SectionTitle>
      <P>
        Abyssal charges minimal fees to keep options liquid. All fees are denominated in USDC
        and go to the protocol vault (distributed to vLP holders).
      </P>

      <SubTitle>Fee table</SubTitle>
      <Table
        headers={['Action', 'Fee', 'Cap', 'Applied to']}
        rows={[
          ['Buy option',        '5 bps (0.05%)', '—',       'Premium paid'],
          ['Sell option',       '5 bps (0.05%)', '—',       'Proceeds received'],
          ['Exercise (ITM)',    '5 bps (0.05%)', '50 USDC', 'Payoff'],
          ['Exercise (OTM)',    '0%',            '—',       'N/A'],
          ['P2P fill (resale)', '0%',            '—',       'Peer-to-peer direct'],
          ['P2P fill (written)','0%',            '—',       'Peer-to-peer direct'],
          ['P2P settle (written)','5 bps',       '50 USDC', 'Payoff from escrow'],
        ]}
      />

      <SubTitle>Visual comparison</SubTitle>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={feeData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fill: C.text3, fontSize: 11 }} />
          <YAxis tick={{ fill: C.text3, fontSize: 11 }} tickFormatter={v => `${v} bps`} />
          <Tooltip
            contentStyle={{ background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 6 }}
            formatter={(val: number) => [`${val} bps`, 'Fee']}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {feeData.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <SubTitle>Worked examples</SubTitle>
      <Table
        headers={['Scenario', 'Premium / Payoff', 'Fee', 'Net received']}
        rows={[
          ['Buy 1 ETH call, premium = 200 USDC', '200 USDC', '0.10 USDC', '—'],
          ['Sell same call, proceeds = 150 USDC', '150 USDC', '0.075 USDC', '149.93 USDC'],
          ['Exercise, payoff = 400 USDC',         '400 USDC', '0.20 USDC', '399.80 USDC'],
          ['Exercise, payoff = 120,000 USDC',     '120,000 USDC', 'capped at 50 USDC', '119,950 USDC'],
        ]}
      />
    </div>
  );
}

function ArchSection() {
  return (
    <div>
      <SectionTitle>Architecture</SectionTitle>

      <SubTitle>On-chain program (Anchor / Rust)</SubTitle>
      <P>
        The core protocol is a single Anchor program deployed to Solana devnet at
        <Code>CBkvR8SeN6j8RQKB7dSxG3dza2v71XHmWEe8LgfMW1hG</Code>.
      </P>
      <Table
        headers={['Account type', 'PDA seeds', 'Description']}
        rows={[
          ['OptionVault',     '["vault", authority]',                    'Single global vault: collateral, OI, IV params'],
          ['IVOracle',        '["iv_oracle", vault, market_disc]',       'Per-market AFVR surface params + latest price'],
          ['AmmPool',         '["amm_pool", vault, market, type, K, T]', 'Constant-product pool per series'],
          ['OptionPosition',  '["position", owner, vault, market, …]',  'User\'s long option holding'],
          ['LPPosition',      '["lp_position", owner, pool]',           'LP token tracking per user per pool'],
          ['OptionListing',   '["listing", seller, nonce_le8]',         'P2P listing (resale or written)'],
          ['WrittenPosition', '["written_position", buyer, listing]',   'Buyer\'s claim on a written option'],
        ]}
      />

      <SubTitle>Instructions</SubTitle>
      <Table
        headers={['Instruction', 'Who calls', 'Effect']}
        rows={[
          ['initialize_vault',      'Admin once',  'Creates vault PDA'],
          ['initialize_iv_oracle',  'Admin once',  'Creates IVOracle per market'],
          ['update_iv_params',      'Keeper',      'Refreshes AFVR surface params'],
          ['ensure_series',         'User once',   'Initializes AMM pool + position PDAs for a series'],
          ['buy_option',            'User',        'Swaps USDC → option via AMM'],
          ['sell_option',           'User',        'Swaps option → USDC via AMM'],
          ['exercise_option',       'User',        'Manual ITM exercise at or after expiry'],
          ['settle_expired',        'Keeper/anyone','Auto-settle all expired positions'],
          ['rebalance_delta',       'Keeper',      'Hedge net delta via perp trades'],
          ['add_liquidity',         'LP user',     'Deposit USDC, receive LP tokens'],
          ['remove_liquidity',      'LP user',     'Burn LP tokens, receive USDC'],
          ['list_for_resale',       'User',        'List existing position for P2P sale'],
          ['write_option_listing',  'User',        'Write new option, lock collateral in escrow'],
          ['fill_resale_listing',   'Buyer',       'Transfer position from seller to buyer'],
          ['fill_written_listing',  'Buyer',       'Create WrittenPosition from writer\'s listing'],
          ['cancel_resale_listing', 'Seller',      'Cancel listing, reclaim rent'],
          ['cancel_written_listing','Writer',      'Cancel listing, reclaim collateral'],
          ['settle_written_option', 'Anyone',      'Settle written option at expiry, pay from escrow'],
          ['deposit_vault',         'vLP user',    'Deposit USDC to global vault, receive vLP tokens'],
          ['withdraw_vault',        'vLP user',    'Burn vLP, withdraw proportional USDC'],
        ]}
      />

      <SubTitle>Frontend stack</SubTitle>
      <Table
        headers={['Layer', 'Technology']}
        rows={[
          ['Framework',         'Next.js 14 App Router'],
          ['Wallet',            'Privy (social + hardware wallets)'],
          ['On-chain client',   '@coral-xyz/anchor v0.30.1'],
          ['Charts',            'TradingView Charting Library (chart) + Recharts (analytics)'],
          ['Styling',           'Tailwind CSS + CSS variables (Pacifica palette)'],
          ['Price feed',        'Pacifica REST + WebSocket'],
        ]}
      />

      <SubTitle>Keeper daemon (Python)</SubTitle>
      <P>
        An off-chain Python service handles keeper duties that cannot be done on-chain efficiently:
      </P>
      <Table
        headers={['Loop', 'Interval', 'Action']}
        rows={[
          ['IV update loop',       '300s', 'Compute AFVR params → call update_iv_params'],
          ['Settlement loop',      '30s',  'Find expired positions → call settle_expired'],
          ['Delta rebalance loop', '120s', 'Compute net delta → call rebalance_delta'],
        ]}
      />
    </div>
  );
}

function FAQ() {
  const items: { q: string; a: string }[] = [
    {
      q: 'How do I prove I own an option?',
      a: 'Your proof of ownership is the OptionPosition PDA on-chain. Its address is deterministically derived from your wallet pubkey + the series parameters (market, type, strike, expiry). You can verify it at any time with getProgramAccounts or by deriving the PDA. No NFT is needed — the account IS the proof.',
    },
    {
      q: 'Can I lose more than my premium?',
      a: 'No. As an option buyer your maximum loss is always the premium paid. There is no liquidation risk on long option positions.',
    },
    {
      q: 'What happens if the vault runs out of USDC?',
      a: 'The vault uses a fractional reserve model supplemented by the global vLP backstop. If vault USDC is insufficient for settlement, the transaction reverts with InsufficientCollateral. LPs can always withdraw liquidity that is not locked as open-interest collateral.',
    },
    {
      q: 'What is the difference between selling and exercising?',
      a: 'Selling (sell_option) returns the option to the AMM pool before expiry and receives its current fair-value premium. Exercising (exercise_option) claims the intrinsic payoff at or after expiry. Selling before expiry preserves time value; exercising at expiry captures only intrinsic value. You should sell before expiry if the option is OTM or if you want to lock in current time value.',
    },
    {
      q: 'Are written options the same as AMM-sold options at settlement?',
      a: 'No. Written options are settled from the writer\'s escrow — the protocol vault is not involved in the payoff. Settlement is permissionless: anyone can call settle_written_option after expiry and it will pay the buyer from escrow and return the remainder to the writer.',
    },
    {
      q: 'What is the delta hedging mechanism?',
      a: 'When users buy options, the protocol becomes net short gamma. The keeper daemon measures the aggregate delta of all open positions and trades Pacifica perpetuals to offset it. This is a best-effort hedge — residual gamma, vega, and basis risks remain with LPs.',
    },
    {
      q: 'Can I trade options on real equities?',
      a: 'Yes, on devnet. Abyssal supports equities (NVDA, TSLA, PLTR, CRCL, HOOD, SP500) and commodities (Gold, Silver, Copper, NatGas…) via Pacifica oracle prices. The same on-chain Black-Scholes and AMM mechanics apply.',
    },
    {
      q: 'Is the protocol audited?',
      a: 'Abyssal is in active development on devnet. An audit is planned before mainnet launch. Use the protocol at your own risk — this is beta software.',
    },
  ];

  const [open, setOpen] = useState<number | null>(null);

  return (
    <div>
      <SectionTitle>FAQ</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((item, i) => (
          <div key={i} style={{
            border: `1px solid ${open === i ? C.cyan + '40' : C.border}`,
            borderRadius: 8, overflow: 'hidden',
            transition: 'border-color 0.15s',
          }}>
            <button
              onClick={() => setOpen(open === i ? null : i)}
              style={{
                width: '100%', textAlign: 'left', padding: '13px 16px',
                background: open === i ? `${C.cyan}08` : 'transparent',
                border: 'none', cursor: 'pointer', display: 'flex',
                justifyContent: 'space-between', alignItems: 'center',
                color: C.text, fontSize: 13.5, fontWeight: 500, gap: 8,
              }}
            >
              <span>{item.q}</span>
              <span style={{ color: C.cyan, fontSize: 18, lineHeight: 1, flexShrink: 0 }}>
                {open === i ? '−' : '+'}
              </span>
            </button>
            {open === i && (
              <div style={{ padding: '0 16px 14px', fontSize: 13, color: C.text2, lineHeight: 1.75 }}>
                {item.a}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Docs component ───────────────────────────────────────────────────────

const SECTION_CONTENT: Record<Section, React.FC> = {
  'overview':    Overview,
  'options-101': Options101,
  'amm':         AmmSection,
  'pricing':     PricingSection,
  'marketplace': MarketplaceSection,
  'greeks':      GreeksSection,
  'fees':        FeesSection,
  'architecture':ArchSection,
  'faq':         FAQ,
};

export default function Docs() {
  const [section, setSection] = useState<Section>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const Content = SECTION_CONTENT[section];

  return (
    <div style={{
      flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0,
      background: C.bg,
    }}>
      {/* Sidebar */}
      <div style={{
        width: sidebarOpen ? 220 : 0,
        overflow: 'hidden',
        flexShrink: 0,
        transition: 'width 0.2s',
        borderRight: `1px solid ${C.border}`,
        background: C.bg1,
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '14px 12px 8px', fontSize: 11, color: C.text3, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Documentation
        </div>
        {SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 14px', border: 'none', cursor: 'pointer',
              background: section === s.id ? `${C.cyan}15` : 'transparent',
              borderLeft: `2px solid ${section === s.id ? C.cyan : 'transparent'}`,
              color: section === s.id ? C.text : C.text3,
              fontSize: 13, textAlign: 'left', transition: 'all 0.12s',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => { if (section !== s.id) e.currentTarget.style.color = C.text2; }}
            onMouseLeave={e => { if (section !== s.id) e.currentTarget.style.color = C.text3; }}
          >
            <span style={{ width: 16, textAlign: 'center', color: section === s.id ? C.cyan : C.text3, fontFamily: 'serif', fontSize: 14 }}>
              {s.icon}
            </span>
            {s.label}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 36px', maxWidth: 800 }}>
        {/* Breadcrumb / toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <button
            onClick={() => setSidebarOpen(v => !v)}
            style={{
              padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.border}`,
              background: 'transparent', color: C.text3, fontSize: 12, cursor: 'pointer',
            }}
            title="Toggle sidebar"
          >
            ☰
          </button>
          <span style={{ color: C.text3, fontSize: 12 }}>
            Docs / <span style={{ color: C.text }}>{SECTIONS.find(s => s.id === section)?.label}</span>
          </span>
        </div>

        <Content />

        {/* Prev / next navigation */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          marginTop: 40, paddingTop: 20, borderTop: `1px solid ${C.border}`,
        }}>
          {SECTIONS[SECTIONS.findIndex(s => s.id === section) - 1] ? (
            <button
              onClick={() => setSection(SECTIONS[SECTIONS.findIndex(s => s.id === section) - 1].id)}
              style={{
                padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.border}`,
                background: 'transparent', color: C.text2, fontSize: 13, cursor: 'pointer',
              }}
            >
              ← {SECTIONS[SECTIONS.findIndex(s => s.id === section) - 1].label}
            </button>
          ) : <div />}
          {SECTIONS[SECTIONS.findIndex(s => s.id === section) + 1] && (
            <button
              onClick={() => setSection(SECTIONS[SECTIONS.findIndex(s => s.id === section) + 1].id)}
              style={{
                padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.border}`,
                background: `${C.cyan}15`, color: C.cyan, fontSize: 13, cursor: 'pointer',
                borderColor: `${C.cyan}40`,
              }}
            >
              {SECTIONS[SECTIONS.findIndex(s => s.id === section) + 1].label} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
