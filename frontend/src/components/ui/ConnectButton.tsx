'use client';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  PublicKey, Connection, Transaction, TransactionInstruction, SystemProgram,
} from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { SOLANA_RPC, USDC_MINT, PACIFICA_FAUCET_PROGRAM_ID, solscanTx } from '@/lib/constants';

// ── Pacifica devnet faucet constants ─────────────────────────────────────────
const PACIFICA_PROGRAM_ID  = new PublicKey(PACIFICA_FAUCET_PROGRAM_ID);
const USDP_MINT_PK         = USDC_MINT;
const TOKEN_PROGRAM_ID     = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOC_TOKEN_PROG_ID  = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const MINT_USDC_DISCRIMINATOR = Buffer.from([118, 144, 78, 118, 155, 214, 185, 186]);
const USDP_CLAIM_AMOUNT    = BigInt(10_000 * 1_000_000);

async function claimUSDPFaucet(
  user: PublicKey,
  sendTransaction: (tx: Transaction, conn: Connection) => Promise<string>,
): Promise<string> {
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

  const connection = new Connection(SOLANA_RPC, 'confirmed');
  const tx = new Transaction().add(ix);
  return sendTransaction(tx, connection);
}

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

function extractErrorMsg(e: any): string {
  const logs: string[] | undefined = e?.logs ?? e?.transactionError?.logs;
  if (logs?.length) {
    const errLine = logs.find((l: string) => l.includes('Error') || l.includes('error') || l.includes('failed'));
    if (errLine) return errLine.replace(/^Program \S+ /, '').substring(0, 120);
  }
  if (e?.cause?.message) return e.cause.message;
  if (e?.message && e.message !== 'Unexpected error') return e.message;
  return 'Transaction failed — check browser console for details';
}

type FaucetItemProps = {
  address: string;
  publicKey: PublicKey | null;
  sendTransaction: ((tx: Transaction, conn: Connection) => Promise<string>) | null;
  onClose: () => void;
};

function FaucetItem({ address, publicKey, sendTransaction, onClose }: FaucetItemProps) {
  const [state, setState]     = useState<'idle' | 'loading' | 'done'>('idle');
  const [solSig, setSolSig]   = useState('');
  const [usdpSig, setUsdpSig] = useState('');
  const [solErr, setSolErr]   = useState('');
  const [usdpErr, setUsdpErr] = useState('');

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

// ── Wallet selector modal ─────────────────────────────────────────────────────

function WalletModal({ onClose }: { onClose: () => void }) {
  const { wallets, select } = useWallet();

  const handleSelect = useCallback((w: typeof wallets[0]) => {
    onClose();
    select(w.adapter.name as any);
    w.adapter.connect().catch(() => {});
  }, [select, onClose]);

  // Split into installed vs other
  const installed = wallets.filter(w => w.readyState === 'Installed' || w.readyState === 'Loadable');
  const others    = wallets.filter(w => w.readyState !== 'Installed' && w.readyState !== 'Loadable');

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.6)', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg2)', border: '1px solid var(--border2)',
          borderRadius: 12, padding: '20px', minWidth: 320, maxWidth: 400,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Connect Wallet</span>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        {installed.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text2)', textAlign: 'center', padding: '16px 0' }}>
            No wallet detected.{' '}
            <a href="https://phantom.app/download" target="_blank" rel="noreferrer"
              style={{ color: 'var(--cyan)', textDecoration: 'underline' }}>
              Install Phantom
            </a>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {installed.map(w => (
              <button key={w.adapter.name} onClick={() => handleSelect(w)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', borderRadius: 8,
                  background: 'var(--bg3)', border: '1px solid var(--border)',
                  color: 'var(--text)', fontSize: 14, cursor: 'pointer',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--cyan)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                {w.adapter.icon && <img src={w.adapter.icon} alt="" width={24} height={24} style={{ borderRadius: 6 }} />}
                <span style={{ fontWeight: 500 }}>{w.adapter.name}</span>
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--green)', background: 'rgba(2,199,123,0.1)', padding: '2px 6px', borderRadius: 4 }}>
                  Detected
                </span>
              </button>
            ))}
            {others.length > 0 && (
              <>
                <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 4 }}>Other</div>
                {others.map(w => (
                  <button key={w.adapter.name} onClick={() => handleSelect(w)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 14px', borderRadius: 8,
                      background: 'var(--bg3)', border: '1px solid var(--border)',
                      color: 'var(--text2)', fontSize: 14, cursor: 'pointer',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--cyan)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                  >
                    {w.adapter.icon && <img src={w.adapter.icon} alt="" width={24} height={24} style={{ borderRadius: 6 }} />}
                    <span style={{ fontWeight: 500 }}>{w.adapter.name}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main ConnectButton ────────────────────────────────────────────────────────

export function ConnectButton() {
  const { publicKey, connecting, connected, disconnect, sendTransaction } = useWallet();
  const [modalOpen, setModalOpen] = useState(false);
  const [menuOpen, setMenuOpen]   = useState(false);
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
      <>
        <button
          onClick={() => setModalOpen(true)}
          disabled={connecting}
          style={btnStyle({ primary: true })}
        >
          {connecting ? 'Connecting…' : 'Connect Wallet'}
        </button>
        {modalOpen && <WalletModal onClose={() => setModalOpen(false)} />}
      </>
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
          position: 'absolute', top: 'calc(100% + 4px)', right: 0, minWidth: 220,
          background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 6,
          overflow: 'hidden', zIndex: 1000,
        }}>
          <div style={{ padding: '8px 12px', fontSize: 10, color: 'var(--text2)', fontFamily: 'var(--mono)', borderBottom: '1px solid var(--border)', wordBreak: 'break-all' }}>
            {address}
          </div>
          <button onClick={() => { navigator.clipboard.writeText(address); setMenuOpen(false); }} style={menuItemStyle}>
            Copy address
          </button>
          <FaucetItem
            address={address}
            publicKey={publicKey}
            sendTransaction={sendTransaction}
            onClose={() => setMenuOpen(false)}
          />
          <button onClick={() => { disconnect(); setMenuOpen(false); }} style={{ ...menuItemStyle, color: 'var(--red)' }}>
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

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
