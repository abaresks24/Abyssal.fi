'use client';
import React from 'react';
import Image from 'next/image';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

export const Nav = React.memo(function Nav() {
  const { publicKey } = useWallet();
  const addr = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`
    : null;

  return (
    <nav
      style={{
        height: 48,
        background: 'var(--bg1)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 16,
        flexShrink: 0,
        zIndex: 10,
      }}
    >
      {/* Logo + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Image src="/logo.svg" alt="Abyssal" width={24} height={24} style={{ borderRadius: '50%' }} />
        <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.01em', color: 'var(--text)' }}>
          Abyssal<span style={{ color: 'var(--cyan)' }}>.fi</span>
        </span>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Network badge */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '3px 8px',
        border: '1px solid var(--border2)',
        borderRadius: 4,
        fontSize: 11,
        color: 'var(--text3)',
        fontFamily: 'var(--mono)',
      }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
        Devnet
      </div>

      {/* Wallet */}
      <div style={{ fontSize: 12 }}>
        <WalletMultiButton style={{
          height: 28,
          padding: '0 12px',
          fontSize: 12,
          background: 'var(--bg3)',
          border: '1px solid var(--border2)',
          borderRadius: 4,
          color: 'var(--text)',
          fontFamily: 'var(--font)',
        }} />
      </div>
    </nav>
  );
});
