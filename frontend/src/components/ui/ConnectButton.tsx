'use client';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { usePrivy, useLogout } from '@privy-io/react-auth';
import { useWallets } from '@privy-io/react-auth/solana';
import { useWallet } from '@solana/wallet-adapter-react';
import { PRIVY_ENABLED, usePrivyReady } from '@/components/WalletProvider';

// ── Devnet USDC faucet ───────────────────────────────────────────────────────

async function requestFaucet(wallet: string): Promise<string> {
  const res = await fetch('/api/faucet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Faucet failed');
  return data.signature as string;
}

function FaucetItem({ address, onClose }: { address: string; onClose: () => void }) {
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle');
  const [msg, setMsg] = useState('');

  const handleClick = useCallback(async () => {
    setState('loading');
    try {
      await requestFaucet(address);
      setState('ok');
      setMsg('1 000 USDC sent!');
      setTimeout(onClose, 1500);
    } catch (e: any) {
      setState('err');
      setMsg(e?.message ?? 'Error');
    }
  }, [address, onClose]);

  return (
    <button
      onClick={handleClick}
      disabled={state === 'loading' || state === 'ok'}
      style={{
        ...menuItemStyle,
        color: state === 'err' ? 'var(--red)' : state === 'ok' ? 'var(--green)' : 'var(--cyan)',
        opacity: state === 'loading' ? 0.6 : 1,
      }}
    >
      {state === 'loading' ? 'Sending…' : state === 'ok' || state === 'err' ? msg : 'Get devnet USDC'}
    </button>
  );
}

// ── Privy connect button ──────────────────────────────────────────────────────
// login() opens Privy's modal which shows wallet options + email.
// When the user selects a wallet (Phantom, Solflare…), Privy opens that
// wallet's native approval popup directly.
// After approval, PrivyAdapterSync (WalletProvider.tsx) bridges the connection
// into useWallet() so anchor_client can sign transactions.
//
// IMPORTANT: Do NOT call wallet.connect() manually anywhere — Privy handles
// the full connection flow. A second connect() call causes the popup to open
// and immediately close.

function PrivyConnectButton() {
  const { ready, authenticated, login } = usePrivy();
  const { logout } = useLogout();
  const { wallets: privyWallets } = useWallets();
  const { publicKey, disconnect } = useWallet(); // kept in sync by PrivyAdapterSync
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Use adapter publicKey when available (synced from Privy external wallet),
  // otherwise fall back to Privy embedded wallet address.
  const address: string | null = publicKey?.toBase58() ?? privyWallets[0]?.address ?? null;

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
      <button onClick={login} style={btnStyle({ primary: true })}>
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
        <DropdownMenu onClose={() => setMenuOpen(false)}>
          <div style={{ padding: '8px 12px', fontSize: 10, color: 'var(--text2)', fontFamily: 'var(--mono)', borderBottom: '1px solid var(--border)', wordBreak: 'break-all' }}>
            {address}
          </div>
          <button onClick={() => { navigator.clipboard.writeText(address); setMenuOpen(false); }} style={menuItemStyle}>
            Copy address
          </button>
          <FaucetItem address={address} onClose={() => setMenuOpen(false)} />
          <button onClick={() => { disconnect(); logout(); setMenuOpen(false); }} style={{ ...menuItemStyle, color: 'var(--red)' }}>
            Disconnect
          </button>
        </DropdownMenu>
      )}
    </div>
  );
}

// ── Fallback: local dev without Privy app ID ──────────────────────────────────

function AdapterConnectButton() {
  const { publicKey, disconnect, wallets, select, connecting } = useWallet();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const address = publicKey?.toBase58() ?? null;

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const handleSelect = useCallback((w: typeof wallets[0]) => {
    setOpen(false);
    select(w.adapter.name as any);
    w.adapter.connect().catch(() => {});
  }, [select]);

  if (!address) {
    return (
      <div ref={ref} style={{ position: 'relative' }}>
        <button onClick={() => setOpen(v => !v)} disabled={connecting} style={btnStyle({ primary: true })}>
          {connecting ? 'Connecting…' : 'Connect Wallet'}
        </button>
        {open && (
          <DropdownMenu onClose={() => setOpen(false)}>
            {wallets.length === 0 ? (
              <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text2)' }}>
                No wallet detected.{' '}
                <a
                  href="https://phantom.app/download"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--cyan)', textDecoration: 'underline' }}
                >
                  Install Phantom
                </a>
              </div>
            ) : (
              wallets.map(w => (
                <button key={w.adapter.name} onClick={() => handleSelect(w)}
                  style={{ ...menuItemStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {w.adapter.icon && <img src={w.adapter.icon} alt="" width={16} height={16} style={{ borderRadius: 4 }} />}
                  {w.adapter.name}
                </button>
              ))
            )}
          </DropdownMenu>
        )}
      </div>
    );
  }

  const short = `${address.slice(0, 4)}…${address.slice(-4)}`;
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(v => !v)} style={btnStyle({})}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{short}</span>
      </button>
      {open && (
        <DropdownMenu onClose={() => setOpen(false)}>
          <div style={{ padding: '8px 12px', fontSize: 10, color: 'var(--text2)', fontFamily: 'var(--mono)', borderBottom: '1px solid var(--border)', wordBreak: 'break-all' }}>{address}</div>
          <button onClick={() => { navigator.clipboard.writeText(address); setOpen(false); }} style={menuItemStyle}>Copy address</button>
          <FaucetItem address={address} onClose={() => setOpen(false)} />
          <button onClick={() => { disconnect(); setOpen(false); }} style={{ ...menuItemStyle, color: 'var(--red)' }}>Disconnect</button>
        </DropdownMenu>
      )}
    </div>
  );
}

// ── Public export ─────────────────────────────────────────────────────────────

export function ConnectButton() {
  const privyReady = usePrivyReady();
  if (PRIVY_ENABLED && privyReady) return <PrivyConnectButton />;
  return <AdapterConnectButton />;
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

function DropdownMenu({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{
      position: 'absolute', top: 'calc(100% + 4px)', right: 0, minWidth: 200,
      background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 6,
      overflow: 'hidden', zIndex: 1000,
    }}>
      {children}
    </div>
  );
}

function btnStyle({ primary, muted }: { primary?: boolean; muted?: boolean } = {}) {
  return {
    height: 28, padding: '0 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
    background: primary ? 'var(--cyan)' : 'var(--bg3)',
    border: primary ? 'none' : '1px solid var(--border2)',
    borderRadius: 4, color: primary ? '#0a121c' : 'var(--text)',
    fontFamily: 'var(--font)', fontWeight: primary ? 600 : 400,
    cursor: muted ? 'default' : 'pointer', opacity: muted ? 0.5 : 1,
    whiteSpace: 'nowrap' as const,
  };
}

const menuItemStyle: React.CSSProperties = {
  display: 'block', width: '100%', padding: '8px 12px', fontSize: 12,
  color: 'var(--text)', background: 'transparent', border: 'none',
  textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font)',
};
