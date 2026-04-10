'use client';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { usePrivy, useLogout } from '@privy-io/react-auth';
import { useWallets, useSignAndSendTransaction } from '@privy-io/react-auth/solana';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  PublicKey, Connection, Transaction, TransactionInstruction, SystemProgram,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import bs58 from 'bs58';
import { PRIVY_ENABLED } from '@/components/WalletProvider';
import { SOLANA_RPC, USDC_MINT, PACIFICA_FAUCET_PROGRAM_ID, solscanTx } from '@/lib/constants';

// ── Pacifica devnet faucet constants ─────────────────────────────────────────
const PACIFICA_PROGRAM_ID  = new PublicKey(PACIFICA_FAUCET_PROGRAM_ID);
const USDP_MINT_PK         = USDC_MINT; // vault's settlement token (Pacifica USDP)
const TOKEN_PROGRAM_ID     = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOC_TOKEN_PROG_ID  = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const MINT_USDC_DISCRIMINATOR = Buffer.from([118, 144, 78, 118, 155, 214, 185, 186]);
const USDP_CLAIM_AMOUNT    = BigInt(10_000 * 1_000_000); // 10 000 USDP (6 decimals)

/** Calls Pacifica's on-chain mint_test_usdc instruction — user wallet must sign. */
async function claimUSDPFaucet(
  user: PublicKey,
  sendTransaction: (tx: Transaction, conn: Connection) => Promise<string>,
): Promise<string> {
  const connection = new Connection(SOLANA_RPC, 'confirmed');

  // Pre-flight: check user has SOL for fees + rent
  const balance = await connection.getBalance(user);
  if (balance < 10_000_000) { // ~0.01 SOL minimum for rent + fees
    throw new Error('Not enough SOL for transaction fees — claim SOL first and retry');
  }

  const [centralState] = PublicKey.findProgramAddressSync(
    [Buffer.from('central_state')],
    PACIFICA_PROGRAM_ID,
  );
  const [userAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from('user_account'), user.toBuffer()],
    PACIFICA_PROGRAM_ID,
  );
  const userUSDPATA = getAssociatedTokenAddressSync(USDP_MINT_PK, user, false);

  const amountBuf = Buffer.alloc(8);
  amountBuf.writeBigUInt64LE(USDP_CLAIM_AMOUNT);

  const ix = new TransactionInstruction({
    programId: PACIFICA_PROGRAM_ID,
    keys: [
      { pubkey: user,              isSigner: true,  isWritable: true  },
      { pubkey: userAccount,       isSigner: false, isWritable: true  },
      { pubkey: userUSDPATA,       isSigner: false, isWritable: true  },
      { pubkey: USDP_MINT_PK,      isSigner: false, isWritable: true  },
      { pubkey: centralState,      isSigner: false, isWritable: false },
      { pubkey: ASSOC_TOKEN_PROG_ID, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID,  isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([MINT_USDC_DISCRIMINATOR, amountBuf]),
  });

  // Add compute budget (matches successful on-chain txs)
  const tx = new Transaction()
    .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }))
    .add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }))
    .add(ix);

  const sig = await sendTransaction(tx, connection);

  // Wait for confirmation to ensure tokens actually arrive
  await connection.confirmTransaction(sig, 'confirmed');
  return sig;
}

// ── Devnet SOL faucet (server-side) ──────────────────────────────────────────

async function requestSolFaucet(wallet: string): Promise<string> {
  const res = await fetch('/api/faucet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Faucet failed');
  return data.signature as string;
}

type FaucetItemProps = {
  address: string;
  publicKey: PublicKey | null;
  sendTransaction: ((tx: Transaction, conn: Connection) => Promise<string>) | null;
  onClose: () => void;
};

/** Extract a human-readable message from a Solana/wallet/Privy error. */
function extractErrorMsg(e: any): string {
  // Anchor / program logs often contain the real reason
  const logs: string[] | undefined = e?.logs ?? e?.transactionError?.logs;
  if (logs?.length) {
    const errLine = logs.find((l: string) => l.includes('Error') || l.includes('error') || l.includes('failed'));
    if (errLine) return errLine.replace(/^Program \S+ /, '').substring(0, 120);
  }
  // Privy errors wrap the real cause
  if (e?.cause?.message) return e.cause.message;
  // SendTransactionError from web3.js
  if (e?.transactionError?.message) return e.transactionError.message;
  // Standard error message
  if (e?.message && e.message !== 'Unexpected error') return e.message;
  // Fallback: stringify the error
  try { return JSON.stringify(e).substring(0, 150); } catch {}
  return 'Transaction failed — check browser console for details';
}

function FaucetItem({ address, publicKey, sendTransaction, onClose }: FaucetItemProps) {
  const [state, setState]       = useState<'idle' | 'loading' | 'done'>('idle');
  const [solSig, setSolSig]     = useState('');
  const [usdpSig, setUsdpSig]   = useState('');
  const [solErr, setSolErr]     = useState('');
  const [usdpErr, setUsdpErr]   = useState('');

  const handleClick = useCallback(async () => {
    setState('loading');
    setSolErr(''); setUsdpErr('');

    try {
      const sig = await requestSolFaucet(address);
      setSolSig(sig);
    } catch (e: any) {
      setSolErr(e?.message ?? 'SOL faucet failed');
    }

    if (publicKey && sendTransaction) {
      try {
        const sig = await claimUSDPFaucet(publicKey, sendTransaction);
        setUsdpSig(sig);
      } catch (e: any) {
        console.error('[USDP faucet]', e);
        setUsdpErr(extractErrorMsg(e));
      }
    }

    setState('done');
  }, [address, publicKey, sendTransaction]);

  if (state === 'idle' || state === 'loading') {
    return (
      <button
        onClick={handleClick}
        disabled={state === 'loading'}
        style={{ ...menuItemStyle, color: 'var(--cyan)', opacity: state === 'loading' ? 0.6 : 1 }}
      >
        {state === 'loading' ? 'Claiming…' : 'Get devnet tokens (SOL + USDP)'}
      </button>
    );
  }

  const solOk  = !!solSig;
  const usdpOk = !!usdpSig;

  return (
    <div style={{ padding: '10px 12px', fontSize: 11, borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ color: solOk ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
          {solOk ? '✓' : '✗'} 0.05 SOL
        </span>
        {solOk && solSig && (
          <a href={solscanTx(solSig)} target="_blank" rel="noreferrer"
            style={{ fontSize: 10, color: 'var(--text3)', textDecoration: 'none' }}>↗</a>
        )}
        {solErr && <span style={{ color: 'var(--red)', fontSize: 10 }}>{solErr}</span>}
      </div>

      {(publicKey && sendTransaction) ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{ color: usdpOk ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
            {usdpOk ? '✓' : '✗'} 10 000 USDP
          </span>
          {usdpOk && usdpSig && (
            <a href={solscanTx(usdpSig)} target="_blank" rel="noreferrer"
              style={{ fontSize: 10, color: 'var(--text3)', textDecoration: 'none' }}>↗</a>
          )}
          {usdpErr && (
            <span style={{ color: 'var(--red)', fontSize: 10, wordBreak: 'break-word' }}>{usdpErr}</span>
          )}
        </div>
      ) : (
        <div style={{ color: 'var(--text3)', fontSize: 10, marginBottom: 6 }}>
          USDP: wallet not ready (reconnect and retry)
        </div>
      )}

      <button
        onClick={onClose}
        style={{ fontSize: 10, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        Close
      </button>
    </div>
  );
}

// ── Privy connect button ──────────────────────────────────────────────────────
// login() opens Privy's modal which shows wallet options + email.
// After approval, PrivyAdapterSync (WalletProvider.tsx) bridges the connection
// into useWallet() so anchor_client can sign transactions.
//
// IMPORTANT: Do NOT call wallet.connect() manually — Privy handles the full
// connection flow. A second connect() call causes the popup to open and
// immediately close.
//
// IMPORTANT: Do NOT pass login directly as onClick={login}. React passes
// the MouseEvent as the first argument, and Privy may interpret it as
// invalid LoginModalOptions, silently doing nothing. Always wrap it.

function PrivyConnectButton() {
  const { authenticated, ready, login } = usePrivy();
  const { logout } = useLogout();
  const { wallets: privyWallets } = useWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const { publicKey: adapterPublicKey, disconnect, sendTransaction: adapterSendTx } = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Use adapter publicKey if bridge worked, otherwise derive from Privy wallet
  const privyWallet = privyWallets[0] ?? null;
  const effectivePublicKey = adapterPublicKey
    ?? (privyWallet ? new PublicKey(privyWallet.address) : null);
  const address: string | null = effectivePublicKey?.toBase58() ?? null;

  // sendTransaction wrapper: prefers wallet adapter, falls back to Privy native signing
  const sendTransaction = useCallback(async (tx: Transaction, connection: Connection): Promise<string> => {
    if (adapterPublicKey) {
      return adapterSendTx(tx, connection);
    }
    if (!privyWallet) throw new Error('No wallet connected');
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = new PublicKey(privyWallet.address);
    const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    const result = await signAndSendTransaction({
      transaction: serialized,
      wallet: privyWallet,
      chain: 'solana:devnet',
    });
    return bs58.encode(Buffer.from(result.signature));
  }, [adapterPublicKey, adapterSendTx, privyWallet, signAndSendTransaction]);

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
          <FaucetItem address={address} publicKey={effectivePublicKey} sendTransaction={sendTransaction} onClose={() => setMenuOpen(false)} />
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
          <FaucetItem address={address} publicKey={publicKey} sendTransaction={sendTransaction} onClose={() => setOpen(false)} />
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
