'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Connection } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { useVaultStats } from '@/hooks/useVaultStats';
import { PacificaOptionsClient, findVaultPDA, findVlpMintPDA } from '@/lib/anchor_client';
import { VAULT_AUTHORITY, USDC_MINT, SOLANA_RPC, solscanTx, solscanToken } from '@/lib/constants';
import { useBreakpoint } from '@/hooks/useBreakpoint';

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function StatCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <div style={{
      flex: 1, background: 'var(--bg2)',
      border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px',
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
  const { publicKey, ...walletRest } = useWallet();
  const wallet = useWallet();
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

  const { totalCollateral, totalVlpTokens, openInterest, feesCollected, loading: statsLoading } = stats;
  const vlpPrice      = totalVlpTokens > 0 ? totalCollateral / totalVlpTokens : 1;
  const userValueUsdc = vlpBalance * vlpPrice;
  const utilization   = totalCollateral > 0 ? (openInterest / totalCollateral) * 100 : 0;

  const vlpMintAddress = (() => {
    try {
      const [vault] = findVaultPDA(new PublicKey(VAULT_AUTHORITY));
      const [mint]  = findVlpMintPDA(vault);
      return mint.toBase58();
    } catch { return null; }
  })();

  const fetchBalances = useCallback(async () => {
    if (!publicKey) { setVlpBalance(0); setUsdpBalance(null); return; }
    setBalLoading(true);
    try {
      const conn      = new Connection(SOLANA_RPC, 'confirmed');
      const authority = new PublicKey(VAULT_AUTHORITY);
      const client    = new PacificaOptionsClient(wallet);

      // vLP balance — pass publicKey explicitly so it works even when wallet.publicKey is null
      try {
        setVlpBalance(await client.getVlpBalance(authority, publicKey));
      } catch { setVlpBalance(0); }

      // USDP balance — use the mint actually stored in the vault
      try {
        const usdcMint = await client.getVaultUsdcMint(authority);
        const ata      = await getAssociatedTokenAddress(usdcMint, publicKey);
        const bal      = await conn.getTokenAccountBalance(ata);
        setUsdpBalance(parseFloat(bal.value.uiAmountString ?? '0'));
      } catch { setUsdpBalance(0); }
    } finally {
      setBalLoading(false);
    }
  }, [publicKey, wallet]);

  useEffect(() => { fetchBalances(); }, [fetchBalances]);

  const handleSubmit = async () => {
    if (!publicKey || !amount) return;
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) { setErr('Enter a valid amount'); return; }
    if (tab === 'deposit' && usdpBalance !== null && val > usdpBalance) {
      setErr(`Insufficient USDP. You have ${fmt(usdpBalance)} USDP.`);
      return;
    }
    setLoading(true); setErr(null); setTxSig(null);
    try {
      const client    = new PacificaOptionsClient(wallet);
      const authority = new PublicKey(VAULT_AUTHORITY);
      const sig = tab === 'deposit'
        ? await client.depositVault({ vaultAuthority: authority, usdcAmount: val })
        : await client.withdrawVault({ vaultAuthority: authority, vlpTokens: vlpPrice > 0 ? val / vlpPrice : 0 });
      setTxSig(sig);
      setAmount('');
      await fetchBalances();
      // Re-fetch after 2 s in case the RPC node hasn't propagated the balance yet
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
          <div style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4, background: 'rgba(85,195,233,0.12)', color: 'var(--cyan)', border: '1px solid rgba(85,195,233,0.25)', fontWeight: 600 }}>
            ABLP — Powered by Pacifica USDP
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="cards-row" style={{ display: 'flex', gap: 12 }}>
        <StatCard label="Total Value Locked" value={statsLoading ? '—' : `$${fmt(totalCollateral)}`} sub="USDP in vault" />
        <StatCard label="vLP Token Price"    value={statsLoading ? '—' : `$${fmt(vlpPrice, 4)}`}    sub="USDP per vLP" accent="var(--cyan)" />
        <StatCard label="Utilization"        value={statsLoading ? '—' : `${fmt(utilization, 1)}%`} sub="Open interest / TVL" accent={utilization > 80 ? 'var(--amber)' : undefined} />
        <StatCard label="Fees Collected"     value={statsLoading ? '—' : `$${fmt(feesCollected)}`}  sub="Cumulative" accent="var(--green)" />
      </div>

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
              <span style={{ flex: 1, textAlign: 'right' }}>No USDP? Use wallet menu → &quot;Get devnet tokens&quot;</span>
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
              You have no USDP. Use wallet menu → &ldquo;Get devnet tokens (SOL + USDP)&rdquo;.
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
              [
                { label: 'vLP Balance',   value: `${fmt(vlpBalance, 4)} vLP`, accent: 'var(--cyan)' as string | undefined },
                { label: 'Current Value', value: `$${fmt(userValueUsdc)}`,     accent: undefined },
                { label: 'Share of Vault',value: totalVlpTokens > 0 ? `${fmt((vlpBalance / totalVlpTokens) * 100, 4)}%` : '—', accent: undefined },
              ].map(({ label, value, accent }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                  <span style={{ color: 'var(--text3)' }}>{label}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: accent ?? 'var(--text)' }}>{value}</span>
                </div>
              ))
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
