'use client';
import React, { useState, useRef, useEffect } from 'react';
import { usePrivy, useLogout } from '@privy-io/react-auth';
import { useWallets } from '@privy-io/react-auth/solana';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PRIVY_ENABLED, usePrivyReady } from '@/components/WalletProvider';

// ── Privy-powered button (only rendered when PRIVY_ENABLED) ─────────────────

function PrivyConnectButton() {
  const { ready, authenticated, connectOrCreateWallet } = usePrivy();
  const { logout } = useLogout();
  const { wallets } = useWallets();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const address: string | null = wallets[0]?.address ?? null;

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  if (!ready) return <button disabled style={btnStyle({ muted: true })}>Loading…</button>;

  if (!authenticated || !address) {
    return (
      <button onClick={connectOrCreateWallet} style={btnStyle({ primary: true })}>
        Connect Wallet
      </button>
    );
  }

  const short = `${address.slice(0, 4)}…${address.slice(-4)}`;

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button onClick={() => setMenuOpen(v => !v)} style={btnStyle({})}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', flexShrink: 0 }} />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{short}</span>
        <svg width="8" height="5" viewBox="0 0 8 5" fill="none" style={{ opacity: 0.5 }}>
          <path d="M1 1l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {menuOpen && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0, minWidth: 160,
          background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 6,
          overflow: 'hidden', zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          <div style={{ padding: '8px 12px', fontSize: 10, color: 'var(--text2)', fontFamily: 'var(--mono)', borderBottom: '1px solid var(--border)', wordBreak: 'break-all' }}>
            {address}
          </div>
          <button onClick={() => { navigator.clipboard.writeText(address); setMenuOpen(false); }} style={menuItemStyle}>
            Copy address
          </button>
          <button onClick={() => { connectOrCreateWallet(); setMenuOpen(false); }} style={menuItemStyle}>
            Add wallet
          </button>
          <button onClick={() => { logout(); setMenuOpen(false); }} style={{ ...menuItemStyle, color: 'var(--red)' }}>
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

// ── Fallback: Solana wallet-adapter button ───────────────────────────────────

function AdapterConnectButton() {
  const { publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const address = publicKey?.toBase58() ?? null;

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  if (!address) {
    return (
      <button onClick={() => setVisible(true)} style={btnStyle({ primary: true })}>
        Connect Wallet
      </button>
    );
  }

  const short = `${address.slice(0, 4)}…${address.slice(-4)}`;

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button onClick={() => setMenuOpen(v => !v)} style={btnStyle({})}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', flexShrink: 0 }} />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{short}</span>
        <svg width="8" height="5" viewBox="0 0 8 5" fill="none" style={{ opacity: 0.5 }}>
          <path d="M1 1l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {menuOpen && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0, minWidth: 160,
          background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 6,
          overflow: 'hidden', zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          <div style={{ padding: '8px 12px', fontSize: 10, color: 'var(--text2)', fontFamily: 'var(--mono)', borderBottom: '1px solid var(--border)', wordBreak: 'break-all' }}>
            {address}
          </div>
          <button onClick={() => { navigator.clipboard.writeText(address); setMenuOpen(false); }} style={menuItemStyle}>
            Copy address
          </button>
          <button onClick={() => { disconnect(); setMenuOpen(false); }} style={{ ...menuItemStyle, color: 'var(--red)' }}>
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

// ── Public export ────────────────────────────────────────────────────────────

export function ConnectButton() {
  const privyReady = usePrivyReady();
  // Don't render PrivyConnectButton until PrivyProvider is in the tree.
  // Avoids "usePrivy must be used within a PrivyProvider" crash.
  if (PRIVY_ENABLED && !privyReady) {
    return <button disabled style={btnStyle({ muted: true })}>Loading…</button>;
  }
  return PRIVY_ENABLED ? <PrivyConnectButton /> : <AdapterConnectButton />;
}

// ── Shared styles ────────────────────────────────────────────────────────────

function btnStyle({ primary, muted }: { primary?: boolean; muted?: boolean } = {}) {
  return {
    height: 28,
    padding: '0 12px',
    fontSize: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: primary ? 'var(--cyan)' : 'var(--bg3)',
    border: primary ? 'none' : '1px solid var(--border2)',
    borderRadius: 4,
    color: primary ? '#0a121c' : 'var(--text)',
    fontFamily: 'var(--font)',
    fontWeight: primary ? 600 : 400,
    cursor: muted ? 'default' : 'pointer',
    opacity: muted ? 0.5 : 1,
    whiteSpace: 'nowrap' as const,
  };
}

const menuItemStyle: React.CSSProperties = {
  display: 'block', width: '100%', padding: '8px 12px', fontSize: 12,
  color: 'var(--text)', background: 'transparent', border: 'none',
  textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font)',
};
