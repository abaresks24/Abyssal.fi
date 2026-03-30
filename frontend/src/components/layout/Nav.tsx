'use client';
import React from 'react';
import Image from 'next/image';
import { ConnectButton } from '@/components/ui/ConnectButton';

export const Nav = React.memo(function Nav() {
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

      <div style={{ flex: 1 }} />

      <ConnectButton />
    </nav>
  );
});
