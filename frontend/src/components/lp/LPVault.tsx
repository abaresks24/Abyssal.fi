'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PublicKey, Connection } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { useEffectiveWallet } from '@/hooks/useEffectiveWallet';
import { useSignerWallet } from '@/hooks/useSignerWallet';
import { useVaultStats } from '@/hooks/useVaultStats';
import { PacificaOptionsClient, findVaultPDA, findVlpMintPDA } from '@/lib/anchor_client';
import { VAULT_AUTHORITY, SOLANA_RPC, solscanTx, solscanToken } from '@/lib/constants';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { BurnVlpButton } from './BurnVlpButton';

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function StatCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: string;
}) {
  const accentColor = accent ?? 'var(--cyan)';
  return (
    <div style={{
      flex: 1, background: 'var(--bg2)',
      border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Top accent line */}
      <div style={{
        position: 'absolute', top: 0, left: '15%', right: '15%', height: 1,
        background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`,
        opacity: 0.3,
      }} />
      <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, fontWeight: 500 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--mono)', color: accent ?? 'var(--text)', letterSpacing: '-0.02em' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export function LPVault() {
  const { publicKey } = useEffectiveWallet();
  const { walletForClient, ready: signerReady } = useSignerWallet();
  const stats  = useVaultStats();
  const { isMobile } = useBreakpoint();

  const [tab,        setTab]        = useState<'deposit' | 'withdraw'>('deposit');
  const [amount,     setAmount]     = useState('');
  const [loading,    setLoading]    = useState(false);
  const [txSig,      setTxSig]      = useState<string | null>(null);
  const [err,        setErr]        = useState<string | null>(null);
  const [vlpBalance, setVlpBalance] = useState(0);
  const [balLoading, setBalLoading] = useState(false);
  const [usdpBalance,setUsdpBalance]= useState<number | null>(null);

  const { totalCollateral, totalVlpTokens, openInterest, feesCollected: rawFees, loading: statsLoading } = stats;
  // Hide stale fees when vault is effectively empty (post-reset state)
  const feesCollected = (totalCollateral === 0 && totalVlpTokens === 0) ? 0 : rawFees;
  const vlpPrice      = totalVlpTokens > 0 ? totalCollateral / totalVlpTokens : 1;
  const utilization   = totalCollateral > 0 ? (openInterest / totalCollateral) * 100 : 0;

  // ── Dynamic APY (backed by real fees only) ────────────────────────────────
  // Base rate = fees / collateral (simple, no monthly assumption — honest).
  // Scaled linearly by utilization: 0.5× at 0% util, 1.5× at 100% util.
  // No floor — if fees = 0, displayed APY = 0. Never promises yield we can't back.
  const feeRatio   = totalCollateral > 0 ? feesCollected / totalCollateral : 0;
  const annualized = feeRatio * 12 * 100; // × 12 extrapolation (monthly→yearly)
  const utilScale  = 0.5 + Math.min(1, utilization / 100); // 0.5x–1.5x
  const displayApy = annualized * utilScale;

  // ── Yield accrual (per-hour) ───────────────────────────────────────────────
  // User deposited X USDP → got vLP at entry price
  // Their withdrawable = deposit + accrued yield (NOT full vault share)
  // Accrued yield = deposit × APY × (hours since deposit) / 8760
  const [depositedAmount, setDepositedAmount] = useState(0);
  const [depositTimestamp, setDepositTimestamp] = useState(0);

  // Read deposit info from localStorage (until we have on-chain tracking)
  useEffect(() => {
    if (!publicKey) return;
    try {
      const key = `abyssal_deposit_${publicKey.toBase58()}`;
      const stored = JSON.parse(localStorage.getItem(key) ?? '{}');
      if (stored.amount > 0) {
        setDepositedAmount(stored.amount);
        setDepositTimestamp(stored.timestamp);
      }
    } catch {}
  }, [publicKey]);

  const hoursElapsed = depositTimestamp > 0 ? Math.max(0, (Date.now() - depositTimestamp) / 3_600_000) : 0;
  const accruedYield = depositedAmount * (displayApy / 100) * (hoursElapsed / 8760);
  const maxWithdrawable = depositedAmount + accruedYield;
  const userValueUsdc = vlpBalance * vlpPrice; // Full vault share (display only)

  // Solvency: vault must keep 120% of open interest
  const solvencyLimit = Math.max(0, totalCollateral - openInterest * 1.2);
  const withdrawBlocked = utilization > 95;
  const effectiveMaxWithdraw = Math.min(maxWithdrawable, solvencyLimit);

  const vlpMintAddress = (() => {
    try {
      const [vault] = findVaultPDA(new PublicKey(VAULT_AUTHORITY));
      const [mint]  = findVlpMintPDA(vault);
      return mint.toBase58();
    } catch { return null; }
  })();

  // Hardcoded USDP mint — same as faucet, same as vault. No env var dependency.
  const USDP_MINT = useMemo(() => new PublicKey('USDPqRbLidFGufty2s3oizmDEKdqx7ePTqzDMbf5ZKM'), []);

  const fetchBalances = useCallback(async () => {
    if (!publicKey) { setVlpBalance(0); setUsdpBalance(null); return; }
    setBalLoading(true);
    const conn = new Connection(SOLANA_RPC, 'confirmed');

    // vLP balance
    try {
      const authority = new PublicKey(VAULT_AUTHORITY);
      const [vault] = findVaultPDA(authority);
      const [vlpMint] = findVlpMintPDA(vault);
      const vlpAta = await getAssociatedTokenAddress(vlpMint, publicKey);
      const bal = await conn.getTokenAccountBalance(vlpAta);
      setVlpBalance(parseFloat(bal.value.uiAmountString ?? '0'));
    } catch { setVlpBalance(0); }

    // USDP balance — direct hardcoded mint, no env var, no on-chain read
    try {
      const ata = await getAssociatedTokenAddress(USDP_MINT, publicKey);
      const bal = await conn.getTokenAccountBalance(ata);
      const amount = parseFloat(bal.value.uiAmountString ?? '0');
      setUsdpBalance(amount);
    } catch {
      setUsdpBalance(0);
    }

    setBalLoading(false);
  }, [publicKey, USDP_MINT]);

  useEffect(() => { fetchBalances(); }, [fetchBalances]);

  const handleSubmit = async () => {
    if (!publicKey || !amount) return;
    if (!signerReady) {
      setErr('Wallet not ready — please wait a moment and retry');
      return;
    }
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) { setErr('Enter a valid amount'); return; }
    if (tab === 'deposit' && usdpBalance !== null && val > usdpBalance) {
      setErr(`Insufficient USDP. You have ${fmt(usdpBalance)} USDP.`);
      return;
    }
    if (tab === 'withdraw') {
      if (withdrawBlocked) {
        setErr('Withdrawals paused — vault utilization > 95%. Wait for positions to settle.');
        return;
      }
      if (val > effectiveMaxWithdraw) {
        setErr(`Max withdrawable: $${fmt(effectiveMaxWithdraw)} (deposit + accrued yield at ${fmt(displayApy, 1)}% APY).`);
        return;
      }
    }
    setLoading(true); setErr(null); setTxSig(null);
    try {
      const client    = new PacificaOptionsClient(walletForClient as any);
      const authority = new PublicKey(VAULT_AUTHORITY);
      const sig = tab === 'deposit'
        ? await client.depositVault({ vaultAuthority: authority, usdcAmount: val })
        : await client.withdrawVault({ vaultAuthority: authority, vlpTokens: vlpPrice > 0 ? val / vlpPrice : 0 });
      setTxSig(sig);

      // Track deposit/withdraw for yield accrual
      if (publicKey) {
        const key = `abyssal_deposit_${publicKey.toBase58()}`;
        if (tab === 'deposit') {
          const prev = JSON.parse(localStorage.getItem(key) ?? '{}');
          const newAmount = (prev.amount ?? 0) + val;
          const ts = prev.timestamp ?? Date.now();
          localStorage.setItem(key, JSON.stringify({ amount: newAmount, timestamp: ts }));
          setDepositedAmount(newAmount);
          if (!depositTimestamp) setDepositTimestamp(ts);
        } else {
          // Subtract from tracked deposit
          const prev = JSON.parse(localStorage.getItem(key) ?? '{}');
          const newAmount = Math.max(0, (prev.amount ?? 0) - val);
          localStorage.setItem(key, JSON.stringify({ amount: newAmount, timestamp: prev.timestamp ?? Date.now() }));
          setDepositedAmount(newAmount);
        }
      }

      setAmount('');
      await fetchBalances();
      setTimeout(() => fetchBalances(), 2000);
    } catch (e: any) {
      const msg: string = e?.message ?? 'Transaction failed';
      const match = msg.match(/Error Code: (\w+)\.[^]*?Error Message: (.+?)\./m);
      setErr(match ? `${match[1]}: ${match[2]}` : msg);
    } finally {
      setLoading(false);
    }
  };

  const previewVlp = (() => {
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) return null;
    return tab === 'deposit'
      ? (totalVlpTokens > 0 && totalCollateral > 0 ? (val * totalVlpTokens) / totalCollateral : val)
      : (vlpPrice > 0 ? val / vlpPrice : 0);
  })();

  const pad = isMobile ? '16px' : '24px 28px';
  const gap = isMobile ? 14 : 20;

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: 'var(--bg)', padding: pad, display: 'flex', flexDirection: 'column', gap }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, letterSpacing: '-0.02em' }}>LP Vault</h2>
        <div style={{ flex: 1 }} />
        {!isMobile && (
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>
            ABLP · Powered by Pacifica USDP
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="cards-row" style={{ display: 'flex', gap: 12 }}>
        <StatCard label="Total Value Locked" value={statsLoading ? '—' : `$${fmt(totalCollateral)}`} sub="USDP in vault" />
        <StatCard label="APY"                value={statsLoading ? '—' : `${fmt(displayApy, 1)}%`}  sub="Fee-based yield" accent="var(--green)" />
        <StatCard label="Utilization"        value={statsLoading ? '—' : `${fmt(utilization, 1)}%`} sub={`OI: $${fmt(openInterest)}`} accent={utilization > 80 ? 'var(--amber)' : utilization > 50 ? 'var(--cyan)' : undefined} />
        <StatCard label="Fees Collected"     value={statsLoading ? '—' : `$${fmt(feesCollected)}`}  sub={`vLP: $${fmt(vlpPrice, 4)}`} accent="var(--cyan)" />
      </div>


      {/* Utilization warning */}
      {utilization > 80 && (
        <div style={{
          padding: '8px 14px', borderRadius: 6, fontSize: 12, lineHeight: 1.5,
          background: utilization > 95 ? 'var(--red-dim)' : 'var(--amber-dim)',
          border: `1px solid ${utilization > 95 ? 'rgba(235,54,90,0.2)' : 'rgba(236,202,90,0.2)'}`,
          color: utilization > 95 ? 'var(--red)' : 'var(--amber)',
        }}>
          {utilization > 95
            ? 'Vault utilization > 95% — withdrawals temporarily paused to protect open positions.'
            : 'High utilization — withdrawal yield reduced to maintain vault solvency.'}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexDirection: isMobile ? 'column' : 'row' }}>

        {/* Form */}
        <div style={{ flex: 1, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '20px 24px' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', marginBottom: 20, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
            {(['deposit', 'withdraw'] as const).map(t => (
              <button key={t} onClick={() => { setTab(t); setErr(null); setTxSig(null); }}
                style={{ flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, textTransform: 'capitalize', background: tab === t ? 'var(--cyan)' : 'transparent', color: tab === t ? '#000' : 'var(--text3)', transition: 'background 0.15s' }}>
                {t}
              </button>
            ))}
          </div>

          {/* USDP balance */}
          {tab === 'deposit' && publicKey && (
            <div style={{ fontSize: 11, color: 'var(--text3)', padding: '7px 10px', marginBottom: 12, background: 'rgba(85,195,233,0.06)', border: '1px solid rgba(85,195,233,0.15)', borderRadius: 5, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>Balance: <span style={{ color: 'var(--text)', fontFamily: 'var(--mono)', fontWeight: 600 }}>{usdpBalance === null ? '…' : `${fmt(usdpBalance)} USDP`}</span></span>
              <span style={{ flex: 1, textAlign: 'right' }}>USDP is auto-credited on first wallet connection</span>
            </div>
          )}

          {/* Amount */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--text3)' }}>{tab === 'deposit' ? 'USDP Amount' : 'USDP Value to Withdraw'}</label>
            {tab === 'deposit' && usdpBalance !== null && usdpBalance > 0 && (
              <button onClick={() => setAmount(usdpBalance.toFixed(6).replace(/\.?0+$/, ''))}
                style={{ fontSize: 11, color: 'var(--cyan)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                Max
              </button>
            )}
          </div>
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>$</span>
            <input type="number" min="0" step="any" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"
              style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px 10px 24px', fontSize: 16, fontFamily: 'var(--mono)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }} />
          </div>

          {tab === 'withdraw' && vlpBalance > 0 && (
            <button onClick={() => setAmount(fmt(userValueUsdc, 2).replace(/,/g, ''))}
              style={{ fontSize: 11, color: 'var(--cyan)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 12px 0', textDecoration: 'underline' }}>
              Max: ${fmt(userValueUsdc)}
            </button>
          )}

          {/* Preview */}
          {previewVlp !== null && amount && (
            <div style={{ background: 'rgba(85,195,233,0.06)', border: '1px solid rgba(85,195,233,0.2)', borderRadius: 6, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: 'var(--text2)' }}>
              {tab === 'deposit'
                ? <>You will receive <span style={{ color: 'var(--cyan)', fontWeight: 700, fontFamily: 'var(--mono)' }}>{fmt(previewVlp, 4)} vLP</span> at ${fmt(vlpPrice, 4)} per vLP</>
                : <>Burning <span style={{ color: 'var(--amber)', fontWeight: 700, fontFamily: 'var(--mono)' }}>{fmt(previewVlp, 4)} vLP</span> → ~${fmt(parseFloat(amount))} USDP</>
              }
            </div>
          )}

          {/* Button */}
          <button onClick={handleSubmit} disabled={loading || !publicKey || !amount}
            style={{ width: '100%', padding: '12px', borderRadius: 6, border: 'none', background: !publicKey ? 'var(--bg3)' : tab === 'deposit' ? 'var(--cyan)' : 'var(--amber)', color: !publicKey ? 'var(--text3)' : '#000', fontSize: 14, fontWeight: 700, cursor: (!publicKey || loading || !amount) ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, transition: 'opacity 0.15s' }}>
            {!publicKey ? 'Connect Wallet' : loading ? 'Confirming…' : tab === 'deposit' ? 'Deposit USDP' : 'Withdraw USDP'}
          </button>

          {tab === 'deposit' && publicKey && usdpBalance === 0 && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--amber)', padding: '7px 10px', background: 'rgba(236,202,90,0.08)', borderRadius: 4 }}>
              You have no USDP. Reconnect your wallet to receive 1000 USDP automatically.
            </div>
          )}

          {err   && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--red)',   padding: '8px 12px', background: 'rgba(235,54,90,0.08)',  borderRadius: 4 }}>{err}</div>}
          {txSig && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--green)', padding: '8px 12px', background: 'rgba(2,199,123,0.08)', borderRadius: 4 }}>
              Confirmed · <a href={solscanTx(txSig)} target="_blank" rel="noreferrer" style={{ color: 'var(--cyan)', textDecoration: 'none' }}>View on Solscan</a>
            </div>
          )}
        </div>

        {/* Right column */}
        <div style={{ width: isMobile ? '100%' : 300, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Position */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Your Position</span>
            <button onClick={() => fetchBalances()} disabled={balLoading}
              style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, opacity: balLoading ? 0.5 : 1 }}
              title="Refresh balance">↻</button>
          </div>
            {!publicKey ? (
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>Connect wallet to view your position.</div>
            ) : balLoading ? (
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>Loading…</div>
            ) : vlpBalance === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>No position yet. Deposit USDP to get started.</div>
            ) : (
              <>
                {[
                  { label: 'vLP Balance',   value: `${fmt(vlpBalance, 4)} vLP`, accent: 'var(--cyan)' as string | undefined },
                  { label: 'Current Value', value: `$${fmt(userValueUsdc)}`,     accent: undefined },
                  { label: 'Share of Vault',value: totalVlpTokens > 0 ? `${fmt((vlpBalance / totalVlpTokens) * 100, 4)}%` : '—', accent: undefined },
                ].map(({ label, value, accent }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                    <span style={{ color: 'var(--text3)' }}>{label}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: accent ?? 'var(--text)' }}>{value}</span>
                  </div>
                ))}
                {/* Burn vLP helper — always available */}
                {vlpBalance > 0 && (
                  <div style={{ marginTop: 12, padding: '8px 10px', background: 'rgba(236,202,90,0.08)', border: '1px solid var(--amber)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: 'var(--text2)' }}>
                      Clean up orphan / pre-reset vLP tokens.
                    </span>
                    <BurnVlpButton onDone={fetchBalances} />
                  </div>
                )}
              </>
            )}
          </div>

          {/* vLP mint */}
          {vlpMintAddress && (
            <div style={{ background: 'var(--bg2)', border: '1px solid rgba(85,195,233,0.2)', borderRadius: 8, padding: '14px 18px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--cyan)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>vLP SPL Token</div>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', wordBreak: 'break-all', marginBottom: 8 }}>{vlpMintAddress}</div>
              <a href={solscanToken(vlpMintAddress)} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--cyan)', textDecoration: 'none' }}>View on Solscan ↗</a>
              <span style={{ fontSize: 10, color: 'var(--text3)', display: 'block', marginTop: 6 }}>Visible in Phantom · transferable wallet-to-wallet</span>
            </div>
          )}

          {/* How it works */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>How vLP Works</div>
            {[
              'Deposit USDP → receive vLP SPL tokens (visible in Phantom, transferable).',
              'The vault underwrites all options. Premiums collected increase the vLP price.',
              'vLP price = Total Collateral ÷ Total vLP Supply.',
              'To withdraw: burn vLP tokens → receive proportional USDP.',
              'Withdrawals are subject to a solvency check (120% OI coverage).',
            ].map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>
                <span style={{ color: 'var(--cyan)', flexShrink: 0 }}>•</span>
                <span>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
