'use client';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { usePrivy, useLogout } from '@privy-io/react-auth';
import { useWallets, useSignTransaction } from '@privy-io/react-auth/solana';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Connection, Transaction } from '@solana/web3.js';
import { PRIVY_ENABLED } from '@/components/WalletProvider';
import { SOLANA_RPC } from '@/lib/constants';
import { useAutoFaucet } from '@/hooks/useAutoFaucet';

// ── Privy connect button ──────────────────────────────────────────────────────

function PrivyConnectButton() {
  const { authenticated, ready, login } = usePrivy();
  const { logout } = useLogout();
  const { wallets: privyWallets } = useWallets();
  const { signTransaction: privySignTx } = useSignTransaction();
  const { publicKey: adapterPublicKey, disconnect, signTransaction: adapterSignTx } = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const privyWallet = privyWallets[0] ?? null;
  const effectivePublicKey = adapterPublicKey
    ?? (privyWallet ? new PublicKey(privyWallet.address) : null);
  const address: string | null = effectivePublicKey?.toBase58() ?? null;

  const sendTransaction = useCallback(async (tx: Transaction, connection: Connection): Promise<string> => {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;

    let signed: Buffer;
    if (adapterPublicKey && adapterSignTx) {
      tx.feePayer = adapterPublicKey;
      const signedTx = await adapterSignTx(tx);
      signed = signedTx.serialize();
    } else if (privyWallet) {
      tx.feePayer = new PublicKey(privyWallet.address);
      const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
      const { signedTransaction } = await privySignTx({
        transaction: serialized,
        wallet: privyWallet,
        chain: 'solana:devnet',
      });
      signed = Buffer.from(signedTransaction);
    } else {
      throw new Error('No wallet connected');
    }

    const sig = await connection.sendRawTransaction(signed, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    return sig;
  }, [adapterPublicKey, adapterSignTx, privyWallet, privySignTx]);

  // Auto-faucet: send SOL + 1000 USDP on first connection
  useAutoFaucet(address, effectivePublicKey, sendTransaction);

  const handleLogin = useCallback(() => {
    if (!ready) return;
    try { login(); } catch (err) { console.error('[Abyssal] login() threw:', err); }
  }, [ready, login]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  if (!authenticated || !address) {
    return (
      <button onClick={handleLogin} disabled={!ready} style={btnStyle({ primary: true, muted: !ready })}>
        {ready ? 'Connect Wallet' : 'Loading…'}
      </button>
    );
  }

  const short = `${address.slice(0, 4)}…${address.slice(-4)}`;

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button onClick={() => setMenuOpen(v => !v)} style={btnStyle({})}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', flexShrink: 0, boxShadow: '0 0 6px var(--green-glow)' }} />
        <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{short}</span>
        <svg width="8" height="5" viewBox="0 0 8 5" fill="none" style={{ opacity: 0.5 }}>
          <path d="M1 1l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {menuOpen && (
        <DropdownMenu>
          <div style={{ padding: '8px 12px', fontSize: 10, color: 'var(--text2)', fontFamily: 'var(--mono)', borderBottom: '1px solid var(--border)', wordBreak: 'break-all' }}>
            {address}
          </div>
          <button onClick={() => { navigator.clipboard.writeText(address); setMenuOpen(false); }} style={menuItemStyle}>
            Copy address
          </button>
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
  const { publicKey, disconnect, wallets, select, connecting, sendTransaction } = useWallet();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const address = publicKey?.toBase58() ?? null;

  // Auto-faucet: send SOL + 1000 USDP on first connection
  useAutoFaucet(address, publicKey, sendTransaction);

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
          <DropdownMenu>
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
        <DropdownMenu>
          <div style={{ padding: '8px 12px', fontSize: 10, color: 'var(--text2)', fontFamily: 'var(--mono)', borderBottom: '1px solid var(--border)', wordBreak: 'break-all' }}>{address}</div>
          <button onClick={() => { navigator.clipboard.writeText(address); setOpen(false); }} style={menuItemStyle}>Copy address</button>
          <button onClick={() => { disconnect(); setOpen(false); }} style={{ ...menuItemStyle, color: 'var(--red)' }}>Disconnect</button>
        </DropdownMenu>
      )}
    </div>
  );
}

// ── Public export ─────────────────────────────────────────────────────────────

export function ConnectButton() {
  if (PRIVY_ENABLED) return <PrivyConnectButton />;
  return <AdapterConnectButton />;
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

function DropdownMenu({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 210,
      background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 8,
      overflow: 'hidden', zIndex: 1000,
      boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
    }}>
      {children}
    </div>
  );
}

function btnStyle({ primary, muted }: { primary?: boolean; muted?: boolean } = {}) {
  return {
    height: 30, padding: '0 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
    background: primary
      ? 'linear-gradient(135deg, var(--cyan), #3aadd4)'
      : 'var(--bg3)',
    border: primary ? 'none' : '1px solid var(--border2)',
    borderRadius: 6,
    color: primary ? '#0a121c' : 'var(--text)',
    fontFamily: 'var(--font)', fontWeight: primary ? 700 : 400,
    cursor: muted ? 'default' : 'pointer', opacity: muted ? 0.5 : 1,
    whiteSpace: 'nowrap' as const,
    letterSpacing: primary ? '0.03em' : '0',
    boxShadow: primary ? '0 0 12px rgba(85,195,233,0.2)' : 'none',
    transition: 'all 0.18s ease',
  };
}

const menuItemStyle: React.CSSProperties = {
  display: 'block', width: '100%', padding: '8px 12px', fontSize: 12,
  color: 'var(--text)', background: 'transparent', border: 'none',
  textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font)',
};
