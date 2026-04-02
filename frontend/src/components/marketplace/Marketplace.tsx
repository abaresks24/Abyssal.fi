'use client';
import React, { useState, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import type { Market, Side } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────────

type ListingType = 'Resale' | 'Written';

interface Listing {
  pubkey: string;
  listingType: ListingType;
  seller: string;
  market: Market;
  side: Side;
  strike: number;       // USDC
  expiry: number;       // unix ms
  size: number;         // underlying units
  askPrice: number;     // USDC total
  collateralLocked: number;
  createdAt: number;
}

interface WrittenClaim {
  pubkey: string;
  listing: string;
  writer: string;
  market: Market;
  side: Side;
  strike: number;
  expiry: number;
  size: number;
  premiumPaid: number;
  collateralLocked: number;
  settled: boolean;
  payoffReceived: number;
}

// ── Mock data (replace with getProgramAccounts once program is rebuilt) ────────

const NOW = Date.now();
const DAY = 86_400_000;

const MOCK_LISTINGS: Listing[] = [
  {
    pubkey: '1111',
    listingType: 'Resale',
    seller: '7xKX...AsU',
    market: 'BTC',
    side: 'call',
    strike: 100_000,
    expiry: NOW + 7 * DAY,
    size: 0.5,
    askPrice: 1_800,
    collateralLocked: 0,
    createdAt: NOW - DAY,
  },
  {
    pubkey: '2222',
    listingType: 'Written',
    seller: 'DYw8...5H',
    market: 'ETH',
    side: 'put',
    strike: 3_000,
    expiry: NOW + 14 * DAY,
    size: 2,
    askPrice: 420,
    collateralLocked: 6_000,
    createdAt: NOW - 2 * DAY,
  },
  {
    pubkey: '3333',
    listingType: 'Written',
    seller: 'HU6L...Ro',
    market: 'SOL',
    side: 'call',
    strike: 180,
    expiry: NOW + 3 * DAY,
    size: 10,
    askPrice: 85,
    collateralLocked: 3_600,
    createdAt: NOW - 3600_000,
  },
  {
    pubkey: '4444',
    listingType: 'Resale',
    seller: '4mFY...GW',
    market: 'BTC',
    side: 'put',
    strike: 90_000,
    expiry: NOW + 30 * DAY,
    size: 1,
    askPrice: 2_100,
    collateralLocked: 0,
    createdAt: NOW - 4 * DAY,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Sub-components ────────────────────────────────────────────────────────────

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 6px',
      borderRadius: 3,
      fontSize: 10,
      fontFamily: 'var(--mono)',
      fontWeight: 600,
      letterSpacing: '0.04em',
      background: `${color}22`,
      color,
      border: `1px solid ${color}44`,
    }}>
      {text}
    </span>
  );
}

function ListingRow({ l, onFill }: { l: Listing; onFill: (l: Listing) => void }) {
  const isExpired = l.expiry < Date.now();
  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={td}>{l.market}</td>
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
        <Badge
          text={l.listingType === 'Written' ? 'Written' : 'Resale'}
          color={l.listingType === 'Written' ? 'var(--warn)' : 'var(--cyan)'}
        />
      </td>
      <td style={{ ...td, color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 11 }}>
        {short(l.seller)}
      </td>
      <td style={td}>
        <button
          onClick={() => onFill(l)}
          disabled={isExpired}
          style={{
            padding: '3px 10px', fontSize: 11, fontWeight: 600,
            background: isExpired ? 'var(--bg3)' : 'var(--cyan)',
            color: isExpired ? 'var(--text3)' : '#0a121c',
            border: 'none', borderRadius: 3, cursor: isExpired ? 'default' : 'pointer',
          }}
        >
          Buy
        </button>
      </td>
    </tr>
  );
}

function CreateListingPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab]       = useState<'resale' | 'write'>('resale');
  const [market, setMarket] = useState<Market>('BTC');
  const [side, setSide]     = useState<Side>('call');
  const [strike, setStrike] = useState('');
  const [expDays, setExpDays] = useState('7');
  const [size, setSize]     = useState('');
  const [ask, setAsk]       = useState('');

  const markets: Market[] = ['BTC', 'ETH', 'SOL', 'NVDA', 'TSLA', 'XAU'];

  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 6, padding: 20, maxWidth: 480,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>Create Listing</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 18 }}>×</button>
      </div>

      {/* Tab */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['resale', 'write'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '5px 14px', fontSize: 12, borderRadius: 4, cursor: 'pointer',
              background: tab === t ? 'var(--cyan)' : 'var(--bg3)',
              color: tab === t ? '#0a121c' : 'var(--text2)',
              border: 'none', fontWeight: tab === t ? 600 : 400,
            }}
          >
            {t === 'resale' ? 'Resell Position' : 'Write Option'}
          </button>
        ))}
      </div>

      {tab === 'resale' && (
        <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
          Select one of your existing positions and list it for resale. The protocol vault remains the counterparty at settlement.
        </p>
      )}
      {tab === 'write' && (
        <p style={{ fontSize: 12, color: 'var(--warn)', marginBottom: 12 }}>
          You become the counterparty. You must lock full collateral (strike × size for puts; 2× spot × size for calls). At expiry, the buyer's payoff is deducted from your collateral.
        </p>
      )}

      {/* Form */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <div>
          <label style={label}>Market</label>
          <select value={market} onChange={e => setMarket(e.target.value as Market)} style={input}>
            {markets.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label style={label}>Side</label>
          <select value={side} onChange={e => setSide(e.target.value as Side)} style={input}>
            <option value="call">Call</option>
            <option value="put">Put</option>
          </select>
        </div>
        <div>
          <label style={label}>Strike (USDC)</label>
          <input type="number" value={strike} onChange={e => setStrike(e.target.value)} placeholder="95000" style={input} />
        </div>
        <div>
          <label style={label}>Expiry (days)</label>
          <input type="number" value={expDays} onChange={e => setExpDays(e.target.value)} placeholder="7" style={input} />
        </div>
        <div>
          <label style={label}>Size</label>
          <input type="number" value={size} onChange={e => setSize(e.target.value)} placeholder="1.0" style={input} />
        </div>
        <div>
          <label style={label}>Ask Price (USDC total)</label>
          <input type="number" value={ask} onChange={e => setAsk(e.target.value)} placeholder="1200" style={input} />
        </div>
      </div>

      {tab === 'write' && strike && size && (
        <div style={{ background: 'var(--bg3)', borderRadius: 4, padding: 10, marginBottom: 12, fontSize: 12, fontFamily: 'var(--mono)' }}>
          <div style={{ color: 'var(--text3)' }}>Required collateral</div>
          <div style={{ color: 'var(--warn)', fontWeight: 600 }}>
            {side === 'put'
              ? `$${fmt(parseFloat(strike || '0') * parseFloat(size || '0'))} USDC`
              : `≈$${fmt(parseFloat(strike || '0') * parseFloat(size || '0') * 2)} USDC (2× spot cap)`
            }
          </div>
        </div>
      )}

      <button
        onClick={() => { alert('Connect program after rebuild — currently using mock data'); onClose(); }}
        style={{
          width: '100%', padding: '9px 0', fontWeight: 600, fontSize: 13,
          background: 'var(--cyan)', color: '#0a121c',
          border: 'none', borderRadius: 4, cursor: 'pointer',
        }}
      >
        {tab === 'resale' ? 'Create Listing' : 'Lock Collateral & List'}
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type FilterMarket = Market | 'All';
type FilterSide   = Side   | 'All';
type FilterType   = ListingType | 'All';

export function Marketplace() {
  const { publicKey } = useWallet();
  const [filterMarket, setFilterMarket] = useState<FilterMarket>('All');
  const [filterSide,   setFilterSide]   = useState<FilterSide>('All');
  const [filterType,   setFilterType]   = useState<FilterType>('All');
  const [showCreate,   setShowCreate]   = useState(false);
  const [fillTarget,   setFillTarget]   = useState<Listing | null>(null);

  const filtered = useMemo(() => MOCK_LISTINGS.filter(l => {
    if (filterMarket !== 'All' && l.market !== filterMarket) return false;
    if (filterSide   !== 'All' && l.side !== filterSide)     return false;
    if (filterType   !== 'All' && l.listingType !== filterType) return false;
    return true;
  }), [filterMarket, filterSide, filterType]);

  const markets: FilterMarket[] = ['All', 'BTC', 'ETH', 'SOL', 'NVDA', 'TSLA', 'XAU'];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* Header */}
      <div style={{
        padding: '14px 20px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 16 }}>P2P Marketplace</span>
          <span style={{ marginLeft: 8, color: 'var(--text3)', fontSize: 12 }}>
            {filtered.length} active listing{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          disabled={!publicKey}
          style={{
            padding: '6px 14px', fontWeight: 600, fontSize: 12,
            background: publicKey ? 'var(--cyan)' : 'var(--bg3)',
            color: publicKey ? '#0a121c' : 'var(--text3)',
            border: 'none', borderRadius: 4, cursor: publicKey ? 'pointer' : 'default',
          }}
        >
          {publicKey ? '+ Create Listing' : 'Connect to list'}
        </button>
      </div>

      {/* Filters */}
      <div style={{
        padding: '10px 20px', borderBottom: '1px solid var(--border)',
        display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0,
        background: 'var(--bg1)', overflowX: 'auto',
      }}>
        <FilterGroup label="Market" options={markets} value={filterMarket} onChange={v => setFilterMarket(v as FilterMarket)} />
        <FilterGroup label="Side" options={['All', 'call', 'put']} value={filterSide} onChange={v => setFilterSide(v as FilterSide)} />
        <FilterGroup label="Type" options={['All', 'Resale', 'Written']} value={filterType} onChange={v => setFilterType(v as FilterType)} />
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>

        {/* Create listing panel */}
        {showCreate && (
          <div style={{ padding: '16px 0' }}>
            <CreateListingPanel onClose={() => setShowCreate(false)} />
          </div>
        )}

        {/* Fill confirmation */}
        {fillTarget && (
          <FillConfirm listing={fillTarget} onConfirm={() => {
            alert('Connect program after rebuild — currently using mock data');
            setFillTarget(null);
          }} onCancel={() => setFillTarget(null)} />
        )}

        {filtered.length === 0 ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
            No listings match the current filters.
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
                <ListingRow key={l.pubkey} l={l} onFill={setFillTarget} />
              ))}
            </tbody>
          </table>
        )}

        {/* Written options info box */}
        <div style={{
          margin: '24px 0 8px',
          padding: 14,
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          fontSize: 12,
          color: 'var(--text3)',
          lineHeight: 1.6,
        }}>
          <span style={{ color: 'var(--warn)', fontWeight: 600 }}>Written options</span> — the seller is the counterparty, not the protocol vault.
          The seller locks full collateral in escrow at listing time. At expiry, payoff is deducted from that escrow automatically.{' '}
          <span style={{ color: 'var(--text2)' }}>Collateral cannot be withdrawn until settlement or cancellation.</span>
        </div>
      </div>
    </div>
  );
}

// ── Fill confirmation modal ───────────────────────────────────────────────────

function FillConfirm({ listing: l, onConfirm, onCancel }: {
  listing: Listing;
  onConfirm: () => void;
  onCancel:  () => void;
}) {
  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 6, padding: 20, marginBottom: 16, maxWidth: 440,
    }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Confirm Purchase</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16, fontSize: 12 }}>
        {[
          ['Asset',   `${l.market} ${l.side.toUpperCase()}`],
          ['Strike',  `$${fmt(l.strike, 0)}`],
          ['Expires', fmtExpiry(l.expiry)],
          ['Size',    `${fmt(l.size, 4)} ${l.market}`],
          ['You pay', `$${fmt(l.askPrice)} USDC`],
          ['Type',    l.listingType],
        ].map(([k, v]) => (
          <React.Fragment key={k as string}>
            <span style={{ color: 'var(--text3)' }}>{k}</span>
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--text)' }}>{v}</span>
          </React.Fragment>
        ))}
      </div>

      {l.listingType === 'Written' && (
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12, lineHeight: 1.5 }}>
          This is a written option — the counterparty is the seller, not the protocol vault. Collateral of ${fmt(l.collateralLocked)} USDC is locked in escrow.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onConfirm} style={{ flex: 1, padding: '8px 0', fontWeight: 600, fontSize: 12, background: 'var(--cyan)', color: '#0a121c', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          Confirm
        </button>
        <button onClick={onCancel} style={{ flex: 1, padding: '8px 0', fontSize: 12, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── FilterGroup ───────────────────────────────────────────────────────────────

function FilterGroup({ label, options, value, onChange }: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 500 }}>{label}</span>
      <div style={{ display: 'flex', gap: 4 }}>
        {options.map(o => (
          <button
            key={o}
            onClick={() => onChange(o)}
            style={{
              padding: '3px 8px', fontSize: 11, borderRadius: 3, cursor: 'pointer',
              background: value === o ? 'var(--bg3)' : 'transparent',
              color: value === o ? 'var(--text)' : 'var(--text3)',
              border: value === o ? '1px solid var(--border2)' : '1px solid transparent',
              fontWeight: value === o ? 600 : 400,
            }}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const th: React.CSSProperties = {
  padding: '8px 10px', fontSize: 10, fontWeight: 600,
  color: 'var(--text3)', letterSpacing: '0.06em', textTransform: 'uppercase',
  whiteSpace: 'nowrap',
};

const td: React.CSSProperties = {
  padding: '9px 10px', fontSize: 12, whiteSpace: 'nowrap',
};

const label: React.CSSProperties = {
  display: 'block', fontSize: 11, color: 'var(--text3)', marginBottom: 4,
};

const input: React.CSSProperties = {
  width: '100%', padding: '6px 8px', fontSize: 12,
  background: 'var(--bg3)', border: '1px solid var(--border)',
  borderRadius: 4, color: 'var(--text)', fontFamily: 'var(--mono)',
  boxSizing: 'border-box',
};
