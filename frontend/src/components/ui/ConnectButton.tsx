'use client';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { usePrivy, useLogout, useLoginWithSiws } from '@privy-io/react-auth';
import { useWallets } from '@privy-io/react-auth/solana';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletReadyState, type MessageSignerWalletAdapter } from '@solana/wallet-adapter-base';

// bs58 v4 has no type declarations — inline require is the cleanest workaround
// eslint-disable-next-line @typescript-eslint/no-require-imports
const bs58Encode = (require('bs58') as { encode: (buf: Uint8Array) => string }).encode;
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

// ── Privy SIWS connect button ─────────────────────────────────────────────────
// Why SIWS and not connectOrCreateWallet()?
// Phantom requires connect() to be called in the same synchronous tick as
// the user's click event. Privy's modal does async work before calling
// phantom.connect(), which breaks the "user gesture" context → no popup.
//
// Solution:
//   1. Our picker calls w.adapter.connect() synchronously in onClick → popup opens
//   2. After the wallet connects we sign a SIWS message → Privy authenticates
//   3. Privy session is established; useWallet().publicKey is set for anchor_client

function PrivyConnectButton() {
  const { ready, authenticated, login } = usePrivy();
  const { logout } = useLogout();
  const { wallets: privyWallets } = useWallets();
  const { generateSiwsMessage, loginWithSiws } = useLoginWithSiws();
  const { publicKey, wallets: adapterWallets, select, connecting, disconnect } = useWallet();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen]     = useState(false);
  const [status, setStatus]         = useState<'idle' | 'connecting' | 'signing' | 'error'>('idle');
  const [errorMsg, setErrorMsg]     = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const menuRef   = useRef<HTMLDivElement>(null);

  const address: string | null = publicKey?.toBase58() ?? privyWallets[0]?.address ?? null;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
      if (menuRef.current  && !menuRef.current.contains(e.target as Node))   setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── SIWS flow ──────────────────────────────────────────────────────────────
  // Step 1 (synchronous in onClick) — adapter.connect() → Phantom popup opens
  // Step 2 (async after approval)   — generate SIWS → sign → loginWithSiws
  const handleSelectWallet = useCallback((w: typeof adapterWallets[0]) => {
    setErrorMsg(null);
    setPickerOpen(false);
    setStatus('connecting');

    select(w.adapter.name as any);

    // MUST be synchronous from onClick — this is what opens the Phantom popup
    w.adapter.connect()
      .then(async () => {
        const walletAddress = w.adapter.publicKey?.toBase58();
        if (!walletAddress) throw new Error('No public key after connect');

        setStatus('signing');
        const message = await generateSiwsMessage({ address: walletAddress });
        const encoded  = new TextEncoder().encode(message);

        // signMessage is available after connect()
        const signer = w.adapter as unknown as MessageSignerWalletAdapter;
        if (!signer.signMessage) throw new Error('Wallet does not support signMessage');
        const sig = await signer.signMessage(encoded);
        const signatureB58 = bs58Encode(sig);

        await loginWithSiws({
          message,
          signature: signatureB58,
          walletClientType: w.adapter.name.toLowerCase() as any,
          connectorType: 'injected',
        });

        setStatus('idle');
      })
      .catch((e: any) => {
        setStatus('error');
        setErrorMsg(e?.message ?? 'Connection failed');
      });
  }, [select, generateSiwsMessage, loginWithSiws]);

  const detected = adapterWallets.filter(w =>
    w.readyState === WalletReadyState.Installed ||
    w.readyState === WalletReadyState.Loadable
  );
  const notInstalled = adapterWallets
    .filter(w => w.readyState === WalletReadyState.NotDetected)
    .slice(0, 4);

  if (!ready) return <button disabled style={btnStyle({ muted: true })}>Loading…</button>;

  // ── Not connected ──────────────────────────────────────────────────────────
  if (!authenticated || !address) {
    const busy = status === 'connecting' || status === 'signing' || connecting;
    return (
      <div ref={pickerRef} style={{ position: 'relative' }}>
        <button
          onClick={() => { if (!busy) setPickerOpen(v => !v); }}
          disabled={busy}
          style={btnStyle({ primary: true })}
        >
          {status === 'connecting' ? 'Connecting…'
            : status === 'signing'   ? 'Sign in wallet…'
            : 'Connect Wallet'}
        </button>

        {pickerOpen && (
          <DropdownMenu onClose={() => setPickerOpen(false)}>
            {/* Detected wallets */}
            {detected.length > 0 && (
              <>
                <SectionLabel>Wallets</SectionLabel>
                {detected.map(w => (
                  <WalletRow key={w.adapter.name} wallet={w} onClick={() => handleSelectWallet(w)} />
                ))}
              </>
            )}

            {notInstalled.length > 0 && (
              <>
                <SectionLabel divider>Get a wallet</SectionLabel>
                {notInstalled.map(w => (
                  <WalletRow key={w.adapter.name} wallet={w} onClick={() => handleSelectWallet(w)} dim />
                ))}
              </>
            )}

            {detected.length === 0 && notInstalled.length === 0 && (
              <div style={{ padding: '12px', fontSize: 12, color: 'var(--text3)' }}>
                No Solana wallet found.<br />Install Phantom or Solflare.
              </div>
            )}

            {/* Email / Social — Privy's own modal, email only */}
            <SectionLabel divider>Email / Social</SectionLabel>
            <button
              onClick={() => {
                setPickerOpen(false);
                login({ loginMethods: ['email', 'google', 'twitter'] } as any);
              }}
              style={{ ...menuItemStyle, display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, opacity: 0.7 }}>
                <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
                <path d="M2 8l10 7 10-7" stroke="currentColor" strokeWidth="1.6" />
              </svg>
              Continue with email / social
            </button>

            {errorMsg && (
              <div style={{ padding: '6px 12px', fontSize: 11, color: 'var(--red)' }}>{errorMsg}</div>
            )}
          </DropdownMenu>
        )}
      </div>
    );
  }

  // ── Connected ──────────────────────────────────────────────────────────────
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
          <button
            onClick={() => { disconnect(); logout(); setMenuOpen(false); }}
            style={{ ...menuItemStyle, color: 'var(--red)' }}
          >
            Disconnect
          </button>
        </DropdownMenu>
      )}
    </div>
  );
}

// ── Fallback: Privy not configured (local dev) ────────────────────────────────

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
            {wallets.map(w => (
              <WalletRow key={w.adapter.name} wallet={w} onClick={() => handleSelect(w)} />
            ))}
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function SectionLabel({ children, divider }: { children: React.ReactNode; divider?: boolean }) {
  return (
    <div style={{
      padding: '6px 12px 4px', fontSize: 10, color: 'var(--text3)',
      textTransform: 'uppercase', letterSpacing: '0.06em',
      borderTop: divider ? '1px solid var(--border)' : undefined,
      marginTop: divider ? 4 : 0,
    }}>
      {children}
    </div>
  );
}

function WalletRow({ wallet: w, onClick, dim }: {
  wallet: ReturnType<typeof useWallet>['wallets'][0];
  onClick: () => void;
  dim?: boolean;
}) {
  return (
    <button onClick={onClick} style={{ ...menuItemStyle, display: 'flex', alignItems: 'center', gap: 8, opacity: dim ? 0.55 : 1 }}>
      {w.adapter.icon && <img src={w.adapter.icon} alt="" width={16} height={16} style={{ borderRadius: 4, flexShrink: 0 }} />}
      {w.adapter.name}
    </button>
  );
}

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
