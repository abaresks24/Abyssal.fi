'use client';
import React from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { usePositions } from '@/hooks/usePositions';
import { PROGRAM_ID } from '@/lib/constants';

const SOLSCAN = (pubkey: string) =>
  `https://solscan.io/account/${pubkey}?cluster=devnet`;

function fmt(n: number, d = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtExpiry(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

export const PositionsList = React.memo(function PositionsList() {
  const { publicKey } = useWallet();
  const { positions, loading, refetch } = usePositions(publicKey);

  const open = positions.filter(p => p.status === 'open');

  return (
    <div>
      <div style={{
        fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase',
        letterSpacing: '0.07em', marginBottom: 8, paddingTop: 6,
        borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center',
      }}>
        <span>Open Positions ({loading ? '…' : open.length})</span>
        <button
          onClick={refetch}
          disabled={loading}
          style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, opacity: loading ? 0.5 : 1 }}
          title="Refresh positions"
        >
          ↻
        </button>
      </div>

      {!publicKey ? (
        <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', padding: '12px 0' }}>
          Connect wallet to view positions
        </div>
      ) : loading ? (
        <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', padding: '12px 0' }}>
          Loading…
        </div>
      ) : open.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', padding: '12px 0' }}>
          No open positions
        </div>
      ) : (
        open.map(p => (
          <div key={p.pubkey} style={{ padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: p.optionType === 'Call' ? 'var(--green)' : 'var(--red)' }}>
                {p.market} {p.optionType} ${fmt(p.strike, 0)}
              </span>
              <a
                href={SOLSCAN(p.pubkey)}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 9, color: 'var(--text3)', textDecoration: 'none', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px' }}
                title="View on-chain proof"
              >
                on-chain ↗
              </a>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3 }}>
              {fmt(p.size, 4)} {p.market} · exp {fmtExpiry(p.expiry)} · paid ${fmt(p.premiumPaid)} · IV {(p.entryIv * 100).toFixed(1)}%
            </div>
          </div>
        ))
      )}
    </div>
  );
});
