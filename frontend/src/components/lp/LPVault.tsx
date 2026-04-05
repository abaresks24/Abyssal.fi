'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useVaultStats } from '@/hooks/useVaultStats';
import { PacificaOptionsClient, findVlpMintPDA } from '@/lib/anchor_client';
import { VAULT_AUTHORITY } from '@/lib/constants';
import { useBreakpoint } from '@/hooks/useBreakpoint';

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function StatCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <div style={{
      flex: 1,
      background: 'var(--bg2)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '16px 20px',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--mono)', color: accent ?? 'var(--text)' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export function LPVault() {
  const wallet = useWallet();
  const stats = useVaultStats();
  const { isMobile } = useBreakpoint();

  const [tab, setTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // User's vLP SPL token balance (raw, in vLP units)
  const [vlpBalance, setVlpBalance] = useState(0);
  const [balLoading, setBalLoading] = useState(false);

  const totalCollateral = stats.totalCollateral;
  const totalVlpTokens  = stats.totalVlpTokens;

  // vLP price = total_collateral / total_vlp_tokens (USDC per vLP)
  const vlpPrice = totalVlpTokens > 0 ? totalCollateral / totalVlpTokens : 1;
  const userValueUsdc = vlpBalance * vlpPrice;
  const utilization = totalCollateral > 0
    ? (stats.openInterest / totalCollateral) * 100
    : 0;

  // vLP mint address for display
  const vlpMintAddress = (() => {
    try {
      const [mint] = findVlpMintPDA(new PublicKey(VAULT_AUTHORITY));
      return mint.toBase58();
    } catch { return null; }
  })();

  const fetchBalance = useCallback(async () => {
    if (!wallet.publicKey) { setVlpBalance(0); return; }
    setBalLoading(true);
    try {
      const client    = new PacificaOptionsClient(wallet);
      const authority = new PublicKey(VAULT_AUTHORITY);
      const bal = await client.getVlpBalance(authority);
      setVlpBalance(bal);
    } catch {
      setVlpBalance(0);
    } finally {
      setBalLoading(false);
    }
  }, [wallet]);

  useEffect(() => { fetchBalance(); }, [fetchBalance]);

  const handleSubmit = async () => {
    if (!wallet.publicKey || !amount) return;
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) { setErr('Enter a valid amount'); return; }

    setLoading(true);
    setErr(null);
    setTxSig(null);
    try {
      const client    = new PacificaOptionsClient(wallet);
      const authority = new PublicKey(VAULT_AUTHORITY);

      let sig: string;
      if (tab === 'deposit') {
        sig = await client.depositVault({ vaultAuthority: authority, usdcAmount: val });
      } else {
        // User enters USDC value to withdraw; convert to vLP tokens to burn
        const vlpToBurn = vlpPrice > 0 ? val / vlpPrice : 0;
        sig = await client.withdrawVault({ vaultAuthority: authority, vlpTokens: vlpToBurn });
      }
      setTxSig(sig);
      setAmount('');
      await fetchBalance();
    } catch (e: any) {
      setErr(e?.message ?? 'Transaction failed');
    } finally {
      setLoading(false);
    }
  };

  // Preview for deposit/withdraw
  const previewVlp = (() => {
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) return null;
    if (tab === 'deposit') {
      return totalVlpTokens > 0 && totalCollateral > 0
        ? (val * totalVlpTokens) / totalCollateral
        : val;
    } else {
      return vlpPrice > 0 ? val / vlpPrice : 0;
    }
  })();

  const pad = isMobile ? '16px' : '24px 28px';
  const gap = isMobile ? 14 : 20;

  return (
    <div style={{
      height: '100%',
      overflowY: 'auto',
      background: 'var(--bg)',
      padding: pad,
      display: 'flex',
      flexDirection: 'column',
      gap,
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, letterSpacing: '-0.02em' }}>LP Vault</h2>
        <div style={{ flex: 1 }} />
        {!isMobile && (
          <div style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 4,
            background: 'rgba(85,195,233,0.12)', color: 'var(--cyan)',
            border: '1px solid rgba(85,195,233,0.25)', fontWeight: 600,
          }}>
            ABLP — Powered by Pacifica USDP
          </div>
        )}
      </div>

      {/* Protocol stats */}
      <div className="cards-row" style={{ display: 'flex', gap: 12 }}>
        <StatCard
          label="Total Value Locked"
          value={stats.loading ? '—' : `$${fmt(totalCollateral)}`}
          sub="USDC in vault"
        />
        <StatCard
          label="vLP Token Price"
          value={stats.loading ? '—' : `$${fmt(vlpPrice, 4)}`}
          sub="USDC per vLP"
          accent="var(--cyan)"
        />
        <StatCard
          label="Utilization"
          value={stats.loading ? '—' : `${fmt(utilization, 1)}%`}
          sub="Open interest / TVL"
          accent={utilization > 80 ? 'var(--amber)' : undefined}
        />
        <StatCard
          label="Fees Collected"
          value={stats.loading ? '—' : `$${fmt(stats.feesCollected)}`}
          sub="Cumulative"
          accent="var(--green)"
        />
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexDirection: isMobile ? 'column' : 'row' }}>

        {/* Deposit / Withdraw form */}
        <div style={{
          flex: 1,
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '20px 24px',
        }}>
          {/* Tab switch */}
          <div style={{
            display: 'flex', gap: 0, marginBottom: 20,
            borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)',
          }}>
            {(['deposit', 'withdraw'] as const).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setErr(null); setTxSig(null); }}
                style={{
                  flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: 600,
                  background: tab === t ? 'var(--cyan)' : 'transparent',
                  color: tab === t ? '#000' : 'var(--text3)',
                  transition: 'background 0.15s',
                  textTransform: 'capitalize',
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === 'deposit' && wallet.publicKey && (
            <div style={{
              fontSize: 11, color: 'var(--text3)',
              padding: '7px 10px', marginBottom: 12,
              background: 'rgba(85,195,233,0.06)',
              border: '1px solid rgba(85,195,233,0.15)',
              borderRadius: 5,
            }}>
              Need USDP?{' '}
              <a
                href="https://app.pacifica.fi/faucet"
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--cyan)', textDecoration: 'underline' }}
              >
                Get USDP from Pacifica ↗
              </a>
            </div>
          )}
          <label style={{ fontSize: 12, color: 'var(--text3)', display: 'block', marginBottom: 6 }}>
            {tab === 'deposit' ? 'USDC Amount' : 'USDC Value to Withdraw'}
          </label>
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <span style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              fontSize: 13, color: 'var(--text3)', fontFamily: 'var(--mono)',
            }}>
              $
            </span>
            <input
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              style={{
                width: '100%',
                background: 'var(--bg3)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '10px 12px 10px 24px',
                fontSize: 16,
                fontFamily: 'var(--mono)',
                color: 'var(--text)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {tab === 'withdraw' && vlpBalance > 0 && (
            <button
              onClick={() => setAmount(fmt(userValueUsdc, 2).replace(/,/g, ''))}
              style={{
                fontSize: 11, color: 'var(--cyan)', background: 'none', border: 'none',
                cursor: 'pointer', padding: '0 0 12px 0', textDecoration: 'underline',
              }}
            >
              Max: ${fmt(userValueUsdc)}
            </button>
          )}

          {previewVlp !== null && amount && (
            <div style={{
              background: 'rgba(85,195,233,0.06)',
              border: '1px solid rgba(85,195,233,0.2)',
              borderRadius: 6,
              padding: '10px 14px',
              marginBottom: 16,
              fontSize: 12,
              color: 'var(--text2)',
            }}>
              {tab === 'deposit' ? (
                <>You will receive{' '}
                  <span style={{ color: 'var(--cyan)', fontWeight: 700, fontFamily: 'var(--mono)' }}>
                    {fmt(previewVlp, 4)} vLP
                  </span>
                  {' '}at ${fmt(vlpPrice, 4)} per vLP
                </>
              ) : (
                <>Burning{' '}
                  <span style={{ color: 'var(--amber)', fontWeight: 700, fontFamily: 'var(--mono)' }}>
                    {fmt(previewVlp, 4)} vLP
                  </span>
                  {' '}→ ~$
                  <span style={{ fontWeight: 700, fontFamily: 'var(--mono)' }}>
                    {fmt(parseFloat(amount))}
                  </span>
                  {' '}USDC
                </>
              )}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading || !wallet.publicKey || !amount}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: 6,
              border: 'none',
              background: !wallet.publicKey
                ? 'var(--bg3)'
                : tab === 'deposit'
                  ? 'var(--cyan)'
                  : 'var(--amber)',
              color: !wallet.publicKey ? 'var(--text3)' : '#000',
              fontSize: 14,
              fontWeight: 700,
              cursor: !wallet.publicKey || loading || !amount ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {!wallet.publicKey
              ? 'Connect Wallet'
              : loading
                ? 'Confirming...'
                : tab === 'deposit'
                  ? 'Deposit USDC'
                  : 'Withdraw USDC'}
          </button>

          {err && (
            <div style={{
              marginTop: 10, fontSize: 12, color: 'var(--red)',
              padding: '8px 12px', background: 'rgba(235,54,90,0.08)', borderRadius: 4,
            }}>
              {err}
            </div>
          )}
          {txSig && (
            <div style={{
              marginTop: 10, fontSize: 12, color: 'var(--green)',
              padding: '8px 12px', background: 'rgba(2,199,123,0.08)', borderRadius: 4,
            }}>
              Confirmed ·{' '}
              <a
                href={`https://solscan.io/tx/${txSig}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--cyan)', textDecoration: 'none' }}
              >
                View on Solscan
              </a>
            </div>
          )}
        </div>

        {/* Right column: position + token info + explainer */}
        <div style={{ width: isMobile ? '100%' : 300, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* User position */}
          <div style={{
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '20px 24px',
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, color: 'var(--text)' }}>
              Your Position
            </div>
            {!wallet.publicKey ? (
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>Connect wallet to view your position.</div>
            ) : balLoading ? (
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>Loading...</div>
            ) : vlpBalance === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>No position yet. Deposit USDC to get started.</div>
            ) : (
              <>
                {([
                  { label: 'vLP Balance',   value: `${fmt(vlpBalance, 4)} vLP`, accent: 'var(--cyan)' as const },
                  { label: 'Current Value', value: `$${fmt(userValueUsdc)}` },
                  {
                    label: 'Share of Vault',
                    value: totalVlpTokens > 0 ? `${fmt((vlpBalance / totalVlpTokens) * 100, 4)}%` : '—',
                  },
                ] as { label: string; value: string; accent?: string }[]).map(({ label, value, accent }) => (
                  <div key={label} style={{
                    display: 'flex', justifyContent: 'space-between',
                    padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 12,
                  }}>
                    <span style={{ color: 'var(--text3)' }}>{label}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: accent ?? 'var(--text)' }}>
                      {value}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* vLP Token info */}
          {vlpMintAddress && (
            <div style={{
              background: 'var(--bg2)',
              border: '1px solid rgba(85,195,233,0.2)',
              borderRadius: 8,
              padding: '14px 18px',
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--cyan)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                vLP SPL Token
              </div>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', wordBreak: 'break-all', marginBottom: 8 }}>
                {vlpMintAddress}
              </div>
              <a
                href={`https://solscan.io/token/${vlpMintAddress}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 11, color: 'var(--cyan)', textDecoration: 'none' }}
              >
                View on Solscan ↗
              </a>
              <span style={{ fontSize: 10, color: 'var(--text3)', display: 'block', marginTop: 6 }}>
                Visible in Phantom · transferable wallet-to-wallet
              </span>
            </div>
          )}

          {/* How it works */}
          <div style={{
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '16px 20px',
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: 'var(--text)' }}>
              How vLP Works
            </div>
            {[
              'Deposit USDC → receive vLP SPL tokens (visible in Phantom, transferable).',
              'The vault underwrites all options. Premiums collected increase the vLP price.',
              'vLP price = Total Collateral ÷ Total vLP Supply.',
              'To withdraw: burn vLP tokens → receive proportional USDC.',
              'Withdrawals are subject to a solvency check (120% OI coverage).',
            ].map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>
                <span style={{ color: 'var(--cyan)', flexShrink: 0, fontWeight: 700 }}>•</span>
                <span>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
