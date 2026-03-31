'use client';
import React from 'react';
import Image from 'next/image';
import { ConnectButton } from '@/components/ui/ConnectButton';

export type View = 'trade' | 'portfolio' | 'lp' | 'leaderboard' | 'analytics';

interface NavProps {
  view: View;
  setView: (v: View) => void;
}

const TABS: { id: View; label: string }[] = [
  { id: 'trade',       label: 'Trade'       },
  { id: 'portfolio',   label: 'Portfolio'   },
  { id: 'lp',          label: 'LP Vault'    },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'analytics',   label: 'Analytics'   },
];

export const Nav = React.memo(function Nav({ view, setView }: NavProps) {
  return (
    <nav style={{
      height: 52,
      background: 'var(--bg1)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 20px',
      gap: 0,
      flexShrink: 0,
      zIndex: 10,
    }}>
      {/* Logo + name */}
      <div
        onClick={() => setView('trade')}
        style={{
          display: 'flex', alignItems: 'center', gap: 9,
          cursor: 'pointer', marginRight: 28, flexShrink: 0,
        }}
      >
        <Image src="/logo.svg" alt="Abyssal" width={32} height={32} style={{ borderRadius: '50%' }} />
        <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em', color: 'var(--text)' }}>
          Abyssal<span style={{ color: 'var(--cyan)' }}>.fi</span>
        </span>
      </div>

      {/* Nav tabs */}
      <div style={{ display: 'flex', alignItems: 'stretch', height: '100%', gap: 2, flex: 1 }}>
        {TABS.map(tab => {
          const active = view === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              style={{
                position: 'relative',
                padding: '0 16px',
                border: 'none',
                background: 'transparent',
                color: active ? 'var(--text)' : 'var(--text3)',
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                cursor: 'pointer',
                letterSpacing: active ? '-0.01em' : '0',
                transition: 'color 0.12s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--text2)'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--text3)'; }}
            >
              {tab.label}
              {/* Active underline */}
              {active && (
                <span style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 8,
                  right: 8,
                  height: 2,
                  background: 'var(--cyan)',
                  borderRadius: '2px 2px 0 0',
                }} />
              )}
            </button>
          );
        })}
      </div>

      <ConnectButton />
    </nav>
  );
});
