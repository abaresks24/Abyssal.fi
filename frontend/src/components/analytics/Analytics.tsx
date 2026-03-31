'use client';
import React from 'react';
import { useVaultStats } from '@/hooks/useVaultStats';
import { usePacificaWS } from '@/hooks/usePacificaWS';
import type { Market } from '@/types';

const MARKETS: Market[] = ['BTC', 'ETH', 'SOL'];

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function StatRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ fontSize: 12, color: 'var(--text2)' }}>{label}</span>
      <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 600, color: accent ?? 'var(--text)' }}>{value}</span>
    </div>
  );
}

function MarketCard({ market }: { market: Market }) {
  const { price, change24h, fundingRate } = usePacificaWS(market);
  const isPos = change24h >= 0;

  const fmtPrice = market === 'SOL'
    ? `$${fmt(price, 2)}`
    : `$${fmt(price, 0)}`;

  return (
    <div style={{
      background: 'var(--bg2)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '18px 20px',
      flex: 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>{market}-PERP</span>
        <span style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
          background: isPos ? 'var(--green-dim)' : 'var(--red-dim)',
          color: isPos ? 'var(--green)' : 'var(--red)',
        }}>
          {isPos ? '+' : ''}{change24h.toFixed(2)}%
        </span>
      </div>

      <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--mono)', marginBottom: 16, color: 'var(--text)' }}>
        {price > 0 ? fmtPrice : <span className="skeleton" style={{ width: 120, height: 24, display: 'inline-block' }} />}
      </div>

      <StatRow label="24h Volume" value={price > 0 ? '—' : '—'} />
      <StatRow
        label="Funding Rate"
        value={price > 0 ? `${(fundingRate * 100).toFixed(4)}%` : '—'}
        accent={fundingRate > 0 ? 'var(--green)' : fundingRate < 0 ? 'var(--red)' : undefined}
      />
    </div>
  );
}

function IVGauge({ label, iv, color }: { label: string; iv: number; color: string }) {
  const pct = Math.min(iv * 100, 150) / 150 * 100;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <span style={{ color: 'var(--text2)' }}>{label}</span>
        <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color }}>{(iv * 100).toFixed(1)}%</span>
      </div>
      <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.4s' }} />
      </div>
    </div>
  );
}

export function Analytics() {
  const stats = useVaultStats();
  const utilization = stats.totalCollateral > 0
    ? (stats.openInterest / stats.totalCollateral) * 100
    : 0;

  // Mock IV surface data (will come from IVOracle when pools are live)
  const ivData: Record<Market, { atm: number; skew: number }> = {
    BTC:      { atm: 0.62, skew: -0.08 },
    ETH:      { atm: 0.74, skew: -0.11 },
    SOL:      { atm: 0.89, skew: -0.15 },
    NVDA:     { atm: 0.48, skew: -0.06 },
    TSLA:     { atm: 0.71, skew: -0.09 },
    PLTR:     { atm: 0.83, skew: -0.13 },
    CRCL:     { atm: 0.92, skew: -0.14 },
    HOOD:     { atm: 0.95, skew: -0.17 },
    SP500:    { atm: 0.18, skew: -0.04 },
    XAU:      { atm: 0.14, skew: -0.02 },
    XAG:      { atm: 0.22, skew: -0.04 },
    PAXG:     { atm: 0.61, skew: -0.08 },
    PLATINUM: { atm: 0.19, skew: -0.03 },
    NATGAS:   { atm: 0.55, skew: -0.07 },
    COPPER:   { atm: 0.31, skew: -0.05 },
  };

  return (
    <div style={{
      height: '100%',
      overflowY: 'auto',
      background: 'var(--bg)',
      padding: '24px 28px',
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>Analytics</h2>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
          AFVR IV Model · Black-Scholes pricing
        </span>
      </div>

      {/* Market data */}
      <div style={{ display: 'flex', gap: 12 }}>
        {MARKETS.map(m => <MarketCard key={m} market={m} />)}
      </div>

      <div style={{ display: 'flex', gap: 16 }}>

        {/* Protocol stats */}
        <div style={{
          flex: 1,
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '18px 20px',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--text)' }}>
            Protocol Stats
          </div>
          <StatRow label="Total Value Locked"  value={stats.loading ? '—' : `$${fmt(stats.totalCollateral)}`} />
          <StatRow label="Open Interest"        value={stats.loading ? '—' : `$${fmt(stats.openInterest)}`} />
          <StatRow
            label="Utilization Rate"
            value={stats.loading ? '—' : `${fmt(utilization, 1)}%`}
            accent={utilization > 80 ? 'var(--amber)' : undefined}
          />
          <StatRow label="Fees Collected"       value={stats.loading ? '—' : `$${fmt(stats.feesCollected)}`} accent="var(--green)" />
          <StatRow
            label="Net Delta Exposure"
            value={stats.loading ? '—' : fmt(stats.deltaNet, 4)}
            accent={Math.abs(stats.deltaNet) > 0.1 ? 'var(--amber)' : 'var(--green)'}
          />
          <StatRow label="Active Markets" value="BTC · ETH · SOL" />
          <StatRow label="Option Style"   value="European" />
          <StatRow label="Settlement"     value="Cash · USDC" />
          <StatRow label="Pricing Model"  value="Black-Scholes + AFVR" />
        </div>

        {/* IV Surface */}
        <div style={{
          flex: 1,
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '18px 20px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>IV Surface (ATM)</span>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>AFVR model · from oracle</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(['BTC', 'ETH', 'SOL', 'NVDA', 'TSLA', 'XAU', 'SP500'] as Market[]).map(m => {
              const color = ivData[m].atm > 0.8 ? 'var(--red)' : ivData[m].atm > 0.5 ? 'var(--amber)' : 'var(--cyan)';
              return <IVGauge key={m} label={m} iv={ivData[m].atm} color={color} />;
            })}
          </div>
        </div>

        {/* IV Skew table */}
        <div style={{
          flex: 1,
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '18px 20px',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--text)' }}>
            IV Skew (25Δ Put - Call)
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 80px 80px',
            fontSize: 11,
            color: 'var(--text3)',
            padding: '6px 0',
            borderBottom: '1px solid var(--border)',
            marginBottom: 8,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}>
            <span>Market</span>
            <span style={{ textAlign: 'right' }}>ATM IV</span>
            <span style={{ textAlign: 'right' }}>Skew</span>
          </div>
          {(['BTC', 'ETH', 'SOL', 'NVDA', 'TSLA', 'PLTR', 'XAU', 'XAG', 'NATGAS'] as Market[]).map(m => (
            <div key={m} style={{
              display: 'grid',
              gridTemplateColumns: '1fr 80px 80px',
              padding: '8px 0',
              borderBottom: '1px solid var(--border)',
              fontSize: 12,
            }}>
              <span style={{ fontWeight: 600 }}>{m}</span>
              <span className="mono" style={{ textAlign: 'right' }}>{(ivData[m].atm * 100).toFixed(1)}%</span>
              <span className="mono" style={{ textAlign: 'right', color: 'var(--red)' }}>
                {(ivData[m].skew * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
