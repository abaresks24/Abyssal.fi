'use client';
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useEffectiveWallet } from '@/hooks/useEffectiveWallet';
import { useSignerWallet } from '@/hooks/useSignerWallet';
import { PacificaOptionsClient } from '@/lib/anchor_client';
import { usePositions } from '@/hooks/usePositions';
import { VAULT_AUTHORITY, solscanTx } from '@/lib/constants';
import type { Market, Side, OptionType, OptionPositionAccount } from '@/types';

type ListingType = 'Resale' | 'Written';
interface ListingData {
  pubkey: string; listingType: ListingType; seller: string; market: Market;
  optionType: OptionType; strike: number; expiry: Date; size: number;
  askPrice: number; collateralLocked: number; nonce: number; active: boolean; createdAt: Date;
}

const DAY = 86_400_000;
function fmt(n: number, d = 2) { return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); }
function fmtExpiry(d: Date) { const diff = d.getTime() - Date.now(); if (diff <= 0) return 'Expired'; const days = Math.floor(diff / DAY); const hrs = Math.floor((diff % DAY) / 3_600_000); return days > 0 ? `${days}d ${hrs}h` : `${hrs}h`; }
function short(a: string) { return a.length <= 10 ? a : `${a.slice(0, 4)}…${a.slice(-4)}`; }

function Dropdown<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: T[]; onChange: (v: T) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 6, background: open ? 'var(--bg3)' : 'var(--bg2)', border: `1px solid ${open ? 'var(--cyan)' : 'var(--border)'}`, cursor: 'pointer', minWidth: 100, transition: 'all 0.15s' }}>
        <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 12, color: value === 'All' ? 'var(--text3)' : 'var(--text)', fontWeight: 600, flex: 1 }}>{value}</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, minWidth: '100%', background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 8, zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
          {options.map(o => (
            <button key={o} onClick={() => { onChange(o); setOpen(false); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '8px 12px', background: value === o ? 'rgba(85,195,233,0.08)' : 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 12, color: value === o ? 'var(--cyan)' : 'var(--text)', fontWeight: value === o ? 600 : 400 }}>
              {o}{value === o && <span style={{ fontSize: 10, color: 'var(--cyan)' }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 3, fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600, background: `${color}22`, color, border: `1px solid ${color}44` }}>{text}</span>;
}

// ── Create Listing Form ───────────────────────────────────────────────────────
function CreateListingForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { walletForClient, ready } = useSignerWallet();
  const { publicKey } = useEffectiveWallet();
  const [tab, setTab] = useState<'resale' | 'write'>('resale');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);

  // ── Resale: pick from owned positions ────────────────────────────────────
  const { positions, loading: posLoading } = usePositions(publicKey);
  const openPositions = useMemo(() => positions.filter(p => p.status === 'open' && p.size > 0), [positions]);
  const [selectedPos, setSelectedPos] = useState<OptionPositionAccount | null>(null);
  const [resaleAsk, setResaleAsk] = useState('');

  // ── Write: full custom form ──────────────────────────────────────────────
  const [market, setMarket] = useState<Market>('BTC');
  const [side, setSide] = useState<Side>('call');
  const [strike, setStrike] = useState('');
  const [expDays, setExpDays] = useState('7');
  const [size, setSize] = useState('');
  const [writeAsk, setWriteAsk] = useState('');
  const markets: Market[] = ['BTC', 'ETH', 'SOL', 'NVDA', 'TSLA', 'XAU'];

  const estCollateral = useMemo(() => {
    const s = parseFloat(strike); const sz = parseFloat(size);
    if (!s || !sz) return 0;
    return side === 'put' ? s * sz : s * sz * 2;
  }, [strike, size, side]);

  const handleSubmit = async () => {
    if (!publicKey || !ready) return;
    setLoading(true); setErr(null); setTxSig(null);
    try {
      const client = new PacificaOptionsClient(walletForClient as any);
      const authority = new PublicKey(VAULT_AUTHORITY);

      let sig: string;
      if (tab === 'resale') {
        if (!selectedPos) { setErr('Select a position'); setLoading(false); return; }
        const a = parseFloat(resaleAsk);
        if (!a || a <= 0) { setErr('Enter an ask price'); setLoading(false); return; }
        const expiryTs = Math.floor(selectedPos.expiry.getTime() / 1000);
        sig = await client.listForResale({
          vaultAuthority: authority,
          market: selectedPos.market,
          optionType: selectedPos.optionType,
          strikeUsdc: selectedPos.strike,
          expiry: expiryTs,
          sizeUnderlying: selectedPos.size,
          askPriceUsdc: a,
        });
      } else {
        const s = parseFloat(strike); const sz = parseFloat(size); const a = parseFloat(writeAsk); const d = parseInt(expDays);
        if (!s || !sz || !a || !d) { setErr('Fill all fields'); setLoading(false); return; }
        const expiryDate = new Date(); expiryDate.setDate(expiryDate.getDate() + d); expiryDate.setHours(8, 0, 0, 0);
        await fetch('/api/keeper', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ market }) });
        sig = await client.writeOptionListing({
          vaultAuthority: authority, market, optionType: side === 'call' ? 'Call' : 'Put',
          strikeUsdc: s, expiry: Math.floor(expiryDate.getTime() / 1000), sizeUnderlying: sz, askPriceUsdc: a,
        });
      }
      setTxSig(sig);
      onSuccess();
    } catch (e: any) {
      setErr(e?.message ?? 'Transaction failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: 20, maxWidth: 520 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>Create Listing</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 18 }}>×</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
        {(['resale', 'write'] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); setErr(null); setTxSig(null); }} style={{
            flex: 1, padding: '8px 0', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
            background: tab === t ? (t === 'resale' ? 'var(--cyan-dim)' : 'rgba(236,202,90,0.1)') : 'transparent',
            color: tab === t ? (t === 'resale' ? 'var(--cyan)' : 'var(--amber)') : 'var(--text3)',
            boxShadow: tab === t ? `inset 0 -2px 0 ${t === 'resale' ? 'var(--cyan)' : 'var(--amber)'}` : 'none',
          }}>
            {t === 'resale' ? 'Resell Position' : 'Write Option'}
          </button>
        ))}
      </div>

      {tab === 'resale' ? (
        <>
          <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12, lineHeight: 1.5 }}>
            Select a position to resell. The NFT transfers to the buyer.
          </p>

          {posLoading ? (
            <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>Loading positions…</div>
          ) : openPositions.length === 0 ? (
            <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>No open positions to resell. Buy an option first in Trade.</div>
          ) : (
            <>
              {/* Position selector */}
              <div style={{ marginBottom: 12 }}>
                <label style={lbl}>Select Position</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {openPositions.map(p => {
                    const sel = selectedPos?.pubkey === p.pubkey;
                    const isCall = p.optionType === 'Call';
                    return (
                      <button key={p.pubkey} onClick={() => setSelectedPos(p)} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 12px', borderRadius: 6, cursor: 'pointer', textAlign: 'left',
                        background: sel ? 'rgba(85,195,233,0.08)' : 'var(--bg3)',
                        border: `1px solid ${sel ? 'var(--cyan)' : 'var(--border)'}`,
                        transition: 'all 0.12s',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Badge text={isCall ? 'CALL' : 'PUT'} color={isCall ? 'var(--green)' : 'var(--red)'} />
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{p.market}</span>
                          <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>${fmt(p.strike, 0)}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 10, color: 'var(--text3)' }}>{p.expiry.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                          <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--cyan)' }}>{fmt(p.size, 4)}</span>
                          {sel && <span style={{ fontSize: 10, color: 'var(--cyan)' }}>✓</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Ask price */}
              {selectedPos && (
                <div style={{ marginBottom: 12 }}>
                  <label style={lbl}>Ask Price (USDP)</label>
                  <input type="number" value={resaleAsk} onChange={e => setResaleAsk(e.target.value)} placeholder="500" style={inp} />
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                    Premium paid: ${fmt(selectedPos.premiumPaid)} · Size: {fmt(selectedPos.size, 4)} {selectedPos.market}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <p style={{ fontSize: 11, color: 'var(--amber)', marginBottom: 12, lineHeight: 1.5 }}>
            Write a custom option. You lock collateral in escrow. Buyer pays your ask price. At expiry, payoff deducted from collateral.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div><label style={lbl}>Market</label><select value={market} onChange={e => setMarket(e.target.value as Market)} style={inp}>{markets.map(m => <option key={m}>{m}</option>)}</select></div>
            <div><label style={lbl}>Side</label><select value={side} onChange={e => setSide(e.target.value as Side)} style={inp}><option value="call">Call</option><option value="put">Put</option></select></div>
            <div><label style={lbl}>Strike (USDC)</label><input type="number" value={strike} onChange={e => setStrike(e.target.value)} placeholder="75000" style={inp} /></div>
            <div><label style={lbl}>Expiry (days)</label><input type="number" value={expDays} onChange={e => setExpDays(e.target.value)} placeholder="7" style={inp} /></div>
            <div><label style={lbl}>Size</label><input type="number" value={size} onChange={e => setSize(e.target.value)} placeholder="0.1" style={inp} /></div>
            <div><label style={lbl}>Ask Price (USDP)</label><input type="number" value={writeAsk} onChange={e => setWriteAsk(e.target.value)} placeholder="500" style={inp} /></div>
          </div>
          {estCollateral > 0 && (
            <div style={{ background: 'rgba(236,202,90,0.06)', border: '1px solid rgba(236,202,90,0.15)', borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>
              <div style={{ fontSize: 9, color: 'var(--amber)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Collateral to lock</div>
              <div style={{ fontSize: 13, fontFamily: 'var(--mono)', color: 'var(--amber)', fontWeight: 600 }}>${fmt(estCollateral)} USDP</div>
            </div>
          )}
        </>
      )}

      <button onClick={handleSubmit} disabled={loading || !ready || (tab === 'resale' && !selectedPos)} style={{
        width: '100%', padding: '10px 0', fontWeight: 600, fontSize: 13, borderRadius: 6, marginTop: 4,
        background: ready && (tab !== 'resale' || selectedPos) ? (tab === 'resale' ? 'var(--cyan)' : 'var(--amber)') : 'var(--bg3)',
        color: ready ? '#0a121c' : 'var(--text3)',
        border: 'none', cursor: ready && !loading ? 'pointer' : 'default', opacity: loading ? 0.7 : 1,
      }}>
        {loading ? 'Submitting…' : tab === 'resale' ? 'List for Resale' : 'Lock Collateral & List'}
      </button>

      {err && <div style={{ marginTop: 8, fontSize: 11, color: 'var(--red)', padding: '6px 10px', background: 'var(--red-dim)', borderRadius: 4 }}>{err}</div>}
      {txSig && <div style={{ marginTop: 8, fontSize: 11, color: 'var(--green)', padding: '6px 10px', background: 'var(--green-dim)', borderRadius: 4 }}>
        Listed! <a href={solscanTx(txSig)} target="_blank" rel="noreferrer" style={{ color: 'var(--cyan)' }}>View on Solscan</a>
      </div>}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
type FM = Market | 'All'; type FS = 'call' | 'put' | 'All'; type FT = ListingType | 'All';

export function Marketplace() {
  const { publicKey } = useEffectiveWallet();
  const { walletForClient, ready } = useSignerWallet();
  const [filterMarket, setFilterMarket] = useState<FM>('All');
  const [filterSide, setFilterSide] = useState<FS>('All');
  const [filterType, setFilterType] = useState<FT>('All');
  const [showCreate, setShowCreate] = useState(false);
  const [listings, setListings] = useState<ListingData[]>([]);
  const [loading, setLoading] = useState(true);
  const [fillLoading, setFillLoading] = useState<string | null>(null);
  const [txFeedback, setTxFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    try { setListings(await PacificaOptionsClient.getActiveListings()); } catch { setListings([]); }
    setLoading(false);
  }, []);
  useEffect(() => { fetchListings(); }, [fetchListings]);

  const filtered = useMemo(() => listings.filter(l => {
    if (filterMarket !== 'All' && l.market !== filterMarket) return false;
    if (filterSide !== 'All' && l.optionType !== (filterSide === 'call' ? 'Call' : 'Put')) return false;
    if (filterType !== 'All' && l.listingType !== filterType) return false;
    return true;
  }), [listings, filterMarket, filterSide, filterType]);

  const handleFill = async (l: ListingData) => {
    if (!publicKey || !ready) return;
    setFillLoading(l.pubkey); setTxFeedback(null);
    try {
      const client = new PacificaOptionsClient(walletForClient as any);
      const authority = new PublicKey(VAULT_AUTHORITY);
      let sig: string;
      if (l.listingType === 'Resale') {
        sig = await client.fillResaleListing({
          vaultAuthority: authority, listingPubkey: new PublicKey(l.pubkey),
          sellerPubkey: new PublicKey(l.seller), nonce: l.nonce,
          market: l.market, optionType: l.optionType,
          strikeUsdc: l.strike, expiry: Math.floor(l.expiry.getTime() / 1000),
        });
      } else {
        sig = await client.fillWrittenListing({
          vaultAuthority: authority, listingPubkey: new PublicKey(l.pubkey),
          sellerPubkey: new PublicKey(l.seller), nonce: l.nonce,
        });
      }
      setTxFeedback({ type: 'ok', msg: sig });
      fetchListings();
    } catch (e: any) {
      setTxFeedback({ type: 'err', msg: e?.message ?? 'Fill failed' });
    }
    setFillLoading(null);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>P2P Marketplace</span>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'var(--cyan-dim)', color: 'var(--cyan)', border: '1px solid rgba(85,195,233,0.2)', fontWeight: 600 }}>{filtered.length}</span>
          <button onClick={fetchListings} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 13 }} title="Refresh">↻</button>
        </div>
        <button onClick={() => setShowCreate(true)} disabled={!publicKey} style={{
          padding: '7px 16px', fontWeight: 600, fontSize: 12, borderRadius: 6,
          background: publicKey ? 'var(--cyan)' : 'var(--bg3)', color: publicKey ? '#0a121c' : 'var(--text3)',
          border: 'none', cursor: publicKey ? 'pointer' : 'default',
        }}>
          {publicKey ? '+ Create Listing' : 'Connect to list'}
        </button>
      </div>

      <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0, background: 'var(--bg1)', overflowX: 'auto' }}>
        <Dropdown<FM> label="Market" value={filterMarket} options={['All', 'BTC', 'ETH', 'SOL', 'NVDA', 'TSLA', 'XAU']} onChange={setFilterMarket} />
        <Dropdown<FS> label="Side" value={filterSide} options={['All', 'call', 'put']} onChange={setFilterSide} />
        <Dropdown<FT> label="Type" value={filterType} options={['All', 'Resale', 'Written']} onChange={setFilterType} />
      </div>

      {txFeedback && (
        <div style={{ padding: '8px 20px', borderBottom: '1px solid var(--border)', fontSize: 12, color: txFeedback.type === 'ok' ? 'var(--green)' : 'var(--red)', background: txFeedback.type === 'ok' ? 'var(--green-dim)' : 'var(--red-dim)' }}>
          {txFeedback.type === 'ok' ? <>Filled! <a href={solscanTx(txFeedback.msg)} target="_blank" rel="noreferrer" style={{ color: 'var(--cyan)' }}>Solscan</a></> : txFeedback.msg}
          <button onClick={() => setTxFeedback(null)} style={{ marginLeft: 12, background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 10 }}>✕</button>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>
        {showCreate && <div style={{ padding: '16px 0' }}><CreateListingForm onClose={() => setShowCreate(false)} onSuccess={fetchListings} /></div>}

        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Loading listings…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px 0', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <img src="/logo.svg" alt="" width={48} height={48} style={{ opacity: 0.3, borderRadius: '50%' }} />
            <div style={{ color: 'var(--text2)', fontSize: 14, fontWeight: 600 }}>No active listings</div>
            <div style={{ color: 'var(--text3)', fontSize: 12, maxWidth: 340, lineHeight: 1.6 }}>Resell positions or write custom options for other traders.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Market', 'Side', 'Strike', 'Expires', 'Size', 'Ask', 'Type', 'Collateral', 'Seller', ''].map(h => (
                  <th key={h} style={{ padding: '8px 8px', fontSize: 10, fontWeight: 600, color: 'var(--text3)', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap', textAlign: h === '' ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => {
                const isExpired = l.expiry.getTime() < Date.now();
                const isMine = publicKey?.toBase58() === l.seller;
                return (
                  <tr key={l.pubkey} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={td}><span style={{ fontWeight: 600 }}>{l.market}</span></td>
                    <td style={td}><Badge text={l.optionType} color={l.optionType === 'Call' ? 'var(--green)' : 'var(--red)'} /></td>
                    <td style={{ ...td, fontFamily: 'var(--mono)' }}>${fmt(l.strike, 0)}</td>
                    <td style={{ ...td, fontFamily: 'var(--mono)', color: isExpired ? 'var(--red)' : 'var(--text2)' }}>{fmtExpiry(l.expiry)}</td>
                    <td style={{ ...td, fontFamily: 'var(--mono)' }}>{fmt(l.size, 4)}</td>
                    <td style={{ ...td, fontFamily: 'var(--mono)', color: 'var(--cyan)' }}>${fmt(l.askPrice)}</td>
                    <td style={td}><Badge text={l.listingType} color={l.listingType === 'Written' ? 'var(--amber)' : 'var(--cyan)'} /></td>
                    <td style={{ ...td, fontFamily: 'var(--mono)', fontSize: 11, color: l.collateralLocked > 0 ? 'var(--amber)' : 'var(--text3)' }}>{l.collateralLocked > 0 ? `$${fmt(l.collateralLocked, 0)}` : '—'}</td>
                    <td style={{ ...td, color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 11 }}>{short(l.seller)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      {isMine ? <span style={{ fontSize: 11, color: 'var(--text3)' }}>Yours</span> : (
                        <button onClick={() => handleFill(l)} disabled={isExpired || fillLoading === l.pubkey || !ready} style={{
                          padding: '4px 12px', fontSize: 11, fontWeight: 600, borderRadius: 4,
                          background: isExpired ? 'var(--bg3)' : 'var(--cyan)', color: isExpired ? 'var(--text3)' : '#0a121c',
                          border: 'none', cursor: isExpired || !ready ? 'default' : 'pointer', opacity: fillLoading === l.pubkey ? 0.6 : 1,
                        }}>{fillLoading === l.pubkey ? '…' : 'Buy'}</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div style={{ margin: '24px 0 8px', padding: 14, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 }}>
          <span style={{ color: 'var(--cyan)', fontWeight: 600 }}>Resale</span> — Pick one of your positions and set a price. NFT transfers to buyer on fill. <br />
          <span style={{ color: 'var(--amber)', fontWeight: 600 }}>Written</span> — Create a custom option. Lock collateral in escrow. Buyer pays your ask price.
        </div>
      </div>
    </div>
  );
}

const td: React.CSSProperties = { padding: '10px 8px', fontSize: 12, whiteSpace: 'nowrap' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, color: 'var(--text3)', marginBottom: 4 };
const inp: React.CSSProperties = { width: '100%', padding: '7px 10px', fontSize: 12, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontFamily: 'var(--mono)', boxSizing: 'border-box' };
