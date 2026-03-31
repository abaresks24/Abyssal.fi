'use client';
import React, { useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { PacificaOptionsClient } from '@/lib/anchor_client';
import { useVaultStats } from '@/hooks/useVaultStats';
import { usePacificaWS } from '@/hooks/usePacificaWS';
import { VAULT_AUTHORITY, SCALE, computeStrikes, EXPIRY_OPTIONS, expiryToDate } from '@/lib/constants';
import type { Market, OptionType, Expiry } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{
      flex: 1,
      background: 'var(--bg2)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '14px 18px',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      <span style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--mono)', color: accent ?? 'var(--text)' }}>{value}</span>
      {sub && <span style={{ fontSize: 11, color: 'var(--text3)' }}>{sub}</span>}
    </div>
  );
}

type Tab = 'deposit' | 'withdraw';
const MARKETS: Market[] = ['BTC', 'ETH', 'SOL'];
const OPTION_TYPES: OptionType[] = ['Call', 'Put'];

// ── Main component ────────────────────────────────────────────────────────────

export function LPVault() {
  const wallet = useWallet();
  const stats  = useVaultStats();

  const [tab,       setTab]       = useState<Tab>('deposit');
  const [market,    setMarket]    = useState<Market>('BTC');
  const [optType,   setOptType]   = useState<OptionType>('Call');
  const [expiry,    setExpiry]    = useState<Expiry>('7D');
  const [strikeIdx, setStrikeIdx] = useState(2); // ATM default
  const [amount,    setAmount]    = useState('');
  const [status,    setStatus]    = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [txMsg,     setTxMsg]     = useState('');

  const { price: spot } = usePacificaWS(market);
  const strikes = spot > 0 ? computeStrikes(spot) : [];
  const strike  = strikes[strikeIdx] ?? 0;

  const utilization = stats.totalCollateral > 0
    ? (stats.openInterest / stats.totalCollateral) * 100
    : 0;

  const handleSubmit = useCallback(async () => {
    if (!wallet.publicKey || !wallet.connected) {
      setTxMsg('Connect your wallet first'); setStatus('error'); return;
    }
    const usdcAmt = parseFloat(amount);
    if (!usdcAmt || usdcAmt <= 0) {
      setTxMsg('Enter a valid amount'); setStatus('error'); return;
    }
    if (strike === 0) {
      setTxMsg('Waiting for price feed…'); setStatus('error'); return;
    }

    setStatus('pending');
    setTxMsg('');

    try {
      const client    = new PacificaOptionsClient(wallet as never);
      const authority = new PublicKey(VAULT_AUTHORITY);
      const expiryTs  = Math.floor(expiryToDate(expiry).getTime() / 1000);

      let sig: string;
      if (tab === 'deposit') {
        sig = await client.addLiquidity({
          vaultAuthority: authority,
          market,
          optionType: optType,
          strikeUsdc: strike,
          expiry: expiryTs,
          usdcAmount: usdcAmt,
          minLpTokens: 0,
        });
      } else {
        sig = await client.removeLiquidity({
          vaultAuthority: authority,
          market,
          optionType: optType,
          strikeUsdc: strike,
          expiry: expiryTs,
          lpTokens: usdcAmt,
          minUsdcOut: 0,
        });
      }
      setStatus('success');
      setTxMsg(`Tx confirmed: ${sig.slice(0, 16)}…`);
      setAmount('');
    } catch (e) {
      setStatus('error');
      const msg = String(e);
      if (msg.includes('AccountNotFound') || msg.includes('does not exist')) {
        setTxMsg('AMM pool not initialized for this series. Select a different strike/expiry or wait for pool initialization.');
      } else {
        setTxMsg(msg.length > 120 ? msg.slice(0, 120) + '…' : msg);
      }
    }
  }, [wallet, amount, tab, market, optType, strike, expiry]);

  // ── Render ────────────────────────────────────────────────────────────────

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

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)' }}>
          LP Vault
        </h2>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '3px 10px',
          borderRadius: 20, letterSpacing: '0.04em',
          background: stats.paused ? 'var(--red-dim)' : 'var(--green-dim)',
          color: stats.paused ? 'var(--red)' : 'var(--green)',
          border: `1px solid ${stats.paused ? 'rgba(235,54,90,0.25)' : 'rgba(2,199,123,0.25)'}`,
        }}>
          {stats.loading ? '…' : stats.paused ? 'PAUSED' : 'ACTIVE'}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
          Devnet · European options · USDC-settled
        </span>
      </div>

      {/* ── Stats row ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12 }}>
        <StatCard
          label="Total Value Locked"
          value={stats.loading ? '—' : `$${fmt(stats.totalCollateral)}`}
          sub="USDC in vault"
        />
        <StatCard
          label="Open Interest"
          value={stats.loading ? '—' : `$${fmt(stats.openInterest)}`}
          sub="Options outstanding"
        />
        <StatCard
          label="Utilization"
          value={stats.loading ? '—' : `${fmt(utilization, 1)}%`}
          sub="OI / TVL"
          accent={utilization > 80 ? 'var(--amber)' : utilization > 50 ? 'var(--cyan)' : undefined}
        />
        <StatCard
          label="Fees Earned"
          value={stats.loading ? '—' : `$${fmt(stats.feesCollected)}`}
          sub="Cumulative protocol fees"
          accent="var(--green)"
        />
        <StatCard
          label="Net Delta"
          value={stats.loading ? '—' : fmt(stats.deltaNet, 4)}
          sub="Δ across all series"
          accent={Math.abs(stats.deltaNet) > 0.1 ? 'var(--amber)' : undefined}
        />
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>

        {/* ── Left: explanation + architecture ─────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Model explanation */}
          <div style={{
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '18px 20px',
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--text)' }}>
              How LP works on Abyssal
            </div>
            {[
              ['AMM Counterparty', 'The vault acts as sole counterparty for all option buyers and sellers via constant-product AMM pools.'],
              ['Per-Series Pools', 'Each (market × option type × strike × expiry) has its own AMM pool. LP tokens are minted proportionally to liquidity provided.'],
              ['Premium Yield', 'LPs earn 100% of premiums collected minus hedging costs. Delta exposure is continuously hedged via Pacifica perpetuals.'],
              ['Risk', 'LPs bear residual delta and vega risk. Unhedged net delta appears in the stats above. Maximum loss per pool is bounded by pool TVL.'],
            ].map(([title, body]) => (
              <div key={title} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--cyan)', marginBottom: 3 }}>{title}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>{body}</div>
              </div>
            ))}
          </div>

          {/* Pool status */}
          <div style={{
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '18px 20px',
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--text)' }}>
              Active Pools
            </div>
            <div style={{
              padding: '20px 0',
              textAlign: 'center',
              color: 'var(--text3)',
              fontSize: 12,
              lineHeight: 1.8,
            }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>○</div>
              No AMM pools initialized yet
              <br />
              <span style={{ color: 'var(--text3)', fontSize: 11 }}>
                Pool initialization is done by the vault authority per option series.<br />
                Pools become available when trading begins for a given series.
              </span>
            </div>
          </div>
        </div>

        {/* ── Right: deposit / withdraw form ───────────────────────────────── */}
        <div style={{
          width: 360,
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          flexShrink: 0,
          height: 'fit-content',
        }}>

          {/* Tabs */}
          <div style={{
            display: 'flex',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: 3,
            gap: 3,
          }}>
            {(['deposit', 'withdraw'] as Tab[]).map(t => (
              <button key={t}
                onClick={() => { setTab(t); setStatus('idle'); setTxMsg(''); }}
                style={{
                  flex: 1, padding: '7px 0', border: 'none', borderRadius: 4,
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  background: tab === t ? 'var(--bg2)' : 'transparent',
                  color: tab === t ? 'var(--text)' : 'var(--text3)',
                  transition: 'all 0.15s',
                }}
              >
                {t === 'deposit' ? 'Provide Liquidity' : 'Withdraw'}
              </button>
            ))}
          </div>

          {/* Market + type */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Market</label>
              <Select value={market} onChange={v => { setMarket(v as Market); setStrikeIdx(2); }}>
                {MARKETS.map(m => <option key={m} value={m}>{m}</option>)}
              </Select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Option type</label>
              <Select value={optType} onChange={v => setOptType(v as OptionType)}>
                {OPTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </Select>
            </div>
          </div>

          {/* Strike */}
          <div>
            <label style={labelStyle}>Strike</label>
            {spot > 0 && strikes.length > 0 ? (
              <Select value={String(strikeIdx)} onChange={v => setStrikeIdx(Number(v))}>
                {strikes.map((s, i) => (
                  <option key={s} value={String(i)}>
                    ${s.toLocaleString('en-US')}
                    {i === 2 ? ' (ATM)' : i < 2 ? ' (ITM)' : ' (OTM)'}
                  </option>
                ))}
              </Select>
            ) : (
              <div style={{ ...inputStyle, color: 'var(--text3)', display: 'flex', alignItems: 'center' }}>
                <span className="skeleton" style={{ width: 100, height: 14, display: 'inline-block' }} />
              </div>
            )}
          </div>

          {/* Expiry */}
          <div>
            <label style={labelStyle}>Expiry</label>
            <Select value={expiry} onChange={v => setExpiry(v as Expiry)}>
              {EXPIRY_OPTIONS.map(e => <option key={e} value={e}>{e}</option>)}
            </Select>
          </div>

          {/* Amount */}
          <div>
            <label style={labelStyle}>
              {tab === 'deposit' ? 'USDC amount' : 'LP tokens to burn'}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="number"
                min="0"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                style={{
                  ...inputStyle,
                  width: '100%',
                  paddingRight: 56,
                }}
              />
              <span style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                fontSize: 11, fontWeight: 600, color: 'var(--text3)', pointerEvents: 'none',
              }}>
                {tab === 'deposit' ? 'USDC' : 'LP'}
              </span>
            </div>
          </div>

          {/* Pool info */}
          {strike > 0 && (
            <div style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '10px 12px',
              fontSize: 11,
              color: 'var(--text2)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text3)' }}>Series</span>
                <span className="mono">{market} {optType} ${strike.toLocaleString('en-US')} {expiry}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text3)' }}>Pool status</span>
                <span style={{ color: 'var(--amber)' }}>Not initialized</span>
              </div>
            </div>
          )}

          {/* Status message */}
          {status !== 'idle' && txMsg && (
            <div style={{
              padding: '10px 12px',
              borderRadius: 6,
              fontSize: 11,
              lineHeight: 1.5,
              background: status === 'success' ? 'var(--green-dim)' : status === 'error' ? 'var(--red-dim)' : 'var(--cyan-dim)',
              color: status === 'success' ? 'var(--green)' : status === 'error' ? 'var(--red)' : 'var(--cyan)',
              border: `1px solid ${status === 'success' ? 'rgba(2,199,123,0.2)' : status === 'error' ? 'rgba(235,54,90,0.2)' : 'rgba(85,195,233,0.2)'}`,
            }}>
              {status === 'pending' ? '⏳ ' : status === 'success' ? '✓ ' : '⚠ '}
              {txMsg}
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={status === 'pending' || !wallet.connected}
            style={{
              width: '100%',
              padding: '12px 0',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 700,
              cursor: status === 'pending' || !wallet.connected ? 'not-allowed' : 'pointer',
              background: !wallet.connected
                ? 'var(--bg3)'
                : tab === 'deposit'
                  ? 'var(--green)'
                  : 'var(--cyan)',
              color: !wallet.connected ? 'var(--text3)' : '#000',
              opacity: status === 'pending' ? 0.7 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {!wallet.connected
              ? 'Connect wallet to continue'
              : status === 'pending'
                ? 'Processing…'
                : tab === 'deposit'
                  ? `Add Liquidity`
                  : `Withdraw Liquidity`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Shared micro-components ───────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  color: 'var(--text3)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '9px 12px',
  fontSize: 13,
  color: 'var(--text)',
  fontFamily: 'var(--mono)',
  width: '100%',
};

function Select({ value, onChange, children }: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        ...inputStyle,
        appearance: 'none',
        WebkitAppearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%233d5570'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 10px center',
        paddingRight: 28,
        cursor: 'pointer',
      }}
    >
      {children}
    </select>
  );
}
