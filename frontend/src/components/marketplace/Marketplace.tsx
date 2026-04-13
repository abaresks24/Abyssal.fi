'use client';
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useEffectiveWallet } from '@/hooks/useEffectiveWallet';
import type { Market, Side } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────────

type ListingType = 'Resale' | 'Written';

interface Listing {
  pubkey: string;
  listingType: ListingType;
  seller: string;
  market: Market;
  side: Side;
  strike: number;
  expiry: number;
  size: number;
  askPrice: number;
  collateralLocked: number;
  createdAt: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAY = 86_400_000;

function fmt(n: number, dec = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtExpiry(ms: number) {
  const diff = ms - Date.now();
  const days = Math.floor(diff / DAY);
  const hrs  = Math.floor((diff % DAY) / 3_600_000);
  if (days > 0) return `${days}d ${hrs}h`;
  if (hrs > 0)  return `${hrs}h`;
  return 'Expired';
}

function short(addr: string) {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

// ── Dropdown Selector ─────────────────────────────────────────────────────────

function DropdownSelector<T extends string>({ label, value, options, onChange, renderOption }: {
  label: string;
  value: T;
  options: T[];
  onChange: (v: T) => void;
  renderOption?: (o: T) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 12px', borderRadius: 6,
          background: open ? 'var(--bg3)' : 'var(--bg2)',
          border: `1px solid ${open ? 'var(--cyan)' : 'var(--border)'}`,
          cursor: 'pointer', transition: 'all 0.15s', minWidth: 100,
        }}
      >
        <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>
          {label}
        </span>
        <span style={{ fontSize: 12, color: value === 'All' ? 'var(--text3)' : 'var(--text)', fontWeight: 600, flex: 1 }}>
          {value}
        </span>
        <svg width="8" height="5" viewBox="0 0 8 5" fill="none" style={{ opacity: 0.4, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <path d="M1 1l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0,
          minWidth: '100%', maxHeight: 240, overflowY: 'auto',
          background: 'var(--bg2)', border: '1px solid var(--border2)',
          borderRadius: 8, zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        }}>
          {options.map(o => (
            <button key={o} onClick={() => { onChange(o); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '8px 12px',
                background: value === o ? 'rgba(85,195,233,0.08)' : 'transparent',
                border: 'none', textAlign: 'left', cursor: 'pointer',
                fontSize: 12, color: value === o ? 'var(--cyan)' : 'var(--text)',
                fontWeight: value === o ? 600 : 400, transition: 'background 0.1s',
              }}
            >
              {renderOption ? renderOption(o) : o}
              {value === o && <span style={{ fontSize: 10, color: 'var(--cyan)' }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '1px 6px', borderRadius: 3,
      fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 600, letterSpacing: '0.04em',
      background: `${color}22`, color, border: `1px solid ${color}44`,
    }}>
      {text}
    </span>
  );
}

function ListingRow({ l, onFill }: { l: Listing; onFill: (l: Listing) => void }) {
  const isExpired = l.expiry < Date.now();
  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={td}><span style={{ fontWeight: 600 }}>{l.market}</span></td>
      <td style={td}>
        <Badge text={l.side.toUpperCase()} color={l.side === 'call' ? 'var(--green)' : 'var(--red)'} />
      </td>
      <td style={{ ...td, fontFamily: 'var(--mono)' }}>${fmt(l.strike, 0)}</td>
      <td style={{ ...td, fontFamily: 'var(--mono)', color: isExpired ? 'var(--red)' : 'var(--text2)' }}>
        {fmtExpiry(l.expiry)}
      </td>
      <td style={{ ...td, fontFamily: 'var(--mono)' }}>{fmt(l.size, 4)}</td>
      <td style={{ ...td, fontFamily: 'var(--mono)', color: 'var(--cyan)' }}>${fmt(l.askPrice)}</td>
      <td style={td}>
        <Badge text={l.listingType === 'Written' ? 'Written' : 'Resale'} color={l.listingType === 'Written' ? 'var(--amber)' : 'var(--cyan)'} />
      </td>
      <td style={{ ...td, color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 11 }}>
        {short(l.seller)}
      </td>
      <td style={td}>
        <button onClick={() => onFill(l)} disabled={isExpired} style={{
          padding: '4px 12px', fontSize: 11, fontWeight: 600, borderRadius: 4,
          background: isExpired ? 'var(--bg3)' : 'var(--cyan)', color: isExpired ? 'var(--text3)' : '#0a121c',
          border: 'none', cursor: isExpired ? 'default' : 'pointer',
        }}>Buy</button>
      </td>
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type FilterMarket = Market | 'All';
type FilterSide   = Side   | 'All';
type FilterType   = ListingType | 'All';

export function Marketplace() {
  const { publicKey } = useEffectiveWallet();
  const [filterMarket, setFilterMarket] = useState<FilterMarket>('All');
  const [filterSide,   setFilterSide]   = useState<FilterSide>('All');
  const [filterType,   setFilterType]   = useState<FilterType>('All');
  const [showCreate,   setShowCreate]   = useState(false);

  // TODO: Replace with on-chain listing fetch via getProgramAccounts
  // once the marketplace instructions are deployed
  const listings: Listing[] = [];

  const filtered = useMemo(() => listings.filter(l => {
    if (filterMarket !== 'All' && l.market !== filterMarket) return false;
    if (filterSide   !== 'All' && l.side !== filterSide)     return false;
    if (filterType   !== 'All' && l.listingType !== filterType) return false;
    return true;
  }), [listings, filterMarket, filterSide, filterType]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* Header */}
      <div style={{
        padding: '14px 20px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>P2P Marketplace</span>
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 10,
            background: 'var(--cyan-dim)', color: 'var(--cyan)',
            border: '1px solid rgba(85,195,233,0.2)', fontWeight: 600,
          }}>
            {filtered.length}
          </span>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          disabled={!publicKey}
          style={{
            padding: '7px 16px', fontWeight: 600, fontSize: 12, borderRadius: 6,
            background: publicKey ? 'var(--cyan)' : 'var(--bg3)',
            color: publicKey ? '#0a121c' : 'var(--text3)',
            border: 'none', cursor: publicKey ? 'pointer' : 'default',
          }}
        >
          {publicKey ? '+ Create Listing' : 'Connect to list'}
        </button>
      </div>

      {/* Filters */}
      <div style={{
        padding: '10px 20px', borderBottom: '1px solid var(--border)',
        display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0,
        background: 'var(--bg1)', overflowX: 'auto',
      }}>
        <DropdownSelector<FilterMarket> label="Market" value={filterMarket} options={['All', 'BTC', 'ETH', 'SOL', 'NVDA', 'TSLA', 'XAU']} onChange={setFilterMarket} />
        <DropdownSelector<FilterSide> label="Side" value={filterSide} options={['All', 'call', 'put']} onChange={setFilterSide}
          renderOption={o => o === 'All' ? 'All' : (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: o === 'call' ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{o === 'call' ? '↗' : '↘'}</span>
              {o.charAt(0).toUpperCase() + o.slice(1)}
            </span>
          )}
        />
        <DropdownSelector<FilterType> label="Type" value={filterType} options={['All', 'Resale', 'Written']} onChange={setFilterType} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>

        {/* Create listing panel */}
        {showCreate && (
          <div style={{ padding: '16px 0' }}>
            <div style={{
              background: 'var(--bg2)', border: '1px solid var(--border)',
              borderRadius: 8, padding: 20, maxWidth: 480,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>Create Listing</span>
                <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 18 }}>×</button>
              </div>
              <div style={{
                padding: '20px', textAlign: 'center',
                background: 'var(--bg3)', borderRadius: 6,
                color: 'var(--text3)', fontSize: 13, lineHeight: 1.6,
              }}>
                <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.4 }}>⏳</div>
                <div style={{ fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>P2P listings coming soon</div>
                <div>The on-chain marketplace instructions are being finalized. You can trade options directly from the <strong style={{ color: 'var(--cyan)' }}>Trade</strong> tab.</div>
              </div>
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <div style={{
            padding: '80px 0', textAlign: 'center',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          }}>
            <div style={{ fontSize: 40, opacity: 0.3 }}>⛵</div>
            <div style={{ color: 'var(--text2)', fontSize: 14, fontWeight: 600 }}>No active listings</div>
            <div style={{ color: 'var(--text3)', fontSize: 12, maxWidth: 340, lineHeight: 1.6 }}>
              The P2P marketplace will allow reselling positions and writing custom options.
              For now, trade directly from the Trade tab.
            </div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Market', 'Side', 'Strike', 'Expires', 'Size', 'Ask', 'Type', 'Seller', ''].map(h => (
                  <th key={h} style={{ ...th, textAlign: h === '' ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => (
                <ListingRow key={l.pubkey} l={l} onFill={() => {}} />
              ))}
            </tbody>
          </table>
        )}

        {/* Info box */}
        <div style={{
          margin: '24px 0 8px', padding: 14,
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 8, fontSize: 12, color: 'var(--text3)', lineHeight: 1.6,
        }}>
          <span style={{ color: 'var(--cyan)', fontWeight: 600 }}>How it will work</span> — List your option positions for resale (NFT transfer), or write custom options with locked collateral.
          Buyers can fill listings directly. Settlement is handled by the protocol.
        </div>
      </div>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const th: React.CSSProperties = {
  padding: '8px 10px', fontSize: 10, fontWeight: 600,
  color: 'var(--text3)', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
};

const td: React.CSSProperties = {
  padding: '10px 10px', fontSize: 12, whiteSpace: 'nowrap',
};
