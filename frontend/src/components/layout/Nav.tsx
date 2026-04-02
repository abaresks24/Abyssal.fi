'use client';
import React from 'react';
import Image from 'next/image';
import { ConnectButton } from '@/components/ui/ConnectButton';
import { useBreakpoint } from '@/hooks/useBreakpoint';

export type View = 'trade' | 'portfolio' | 'lp' | 'marketplace' | 'leaderboard' | 'analytics' | 'docs';

interface NavProps {
  view: View;
  setView: (v: View) => void;
}

const TABS: { id: View; label: string; short: string }[] = [
  { id: 'trade',       label: 'Trade',       short: 'Trade'  },
  { id: 'portfolio',   label: 'Portfolio',   short: 'Port.'  },
  { id: 'lp',          label: 'LP Vault',    short: 'LP'     },
  { id: 'marketplace', label: 'Marketplace', short: 'P2P'    },
  { id: 'leaderboard', label: 'Leaderboard', short: 'Board'  },
  { id: 'analytics',   label: 'Analytics',   short: 'Stats'  },
  { id: 'docs',        label: 'Docs',        short: 'Docs'   },
];

export const Nav = React.memo(function Nav({ view, setView }: NavProps) {
  const { isMobile } = useBreakpoint();

  return (
    <nav style={{
      height: isMobile ? 48 : 52,
      background: 'var(--bg1)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: isMobile ? '0 10px' : '0 20px',
      gap: 0,
      flexShrink: 0,
      zIndex: 10,
    }}>
      {/* Logo */}
      <div
        onClick={() => setView('trade')}
        style={{
          display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 9,
          cursor: 'pointer', marginRight: isMobile ? 8 : 28, flexShrink: 0,
        }}
      >
        <Image
          src="/logo.svg"
          alt="Abyssal"
          width={isMobile ? 26 : 32}
          height={isMobile ? 26 : 32}
          style={{ borderRadius: '50%' }}
        />
        {!isMobile && (
          <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em', color: 'var(--text)' }}>
            Abyssal<span style={{ color: 'var(--cyan)' }}>.fi</span>
          </span>
        )}
      </div>

      {/* Nav tabs — horizontally scrollable on mobile */}
      <div
        className="hide-scrollbar"
        style={{
          display: 'flex', alignItems: 'stretch', height: '100%',
          gap: 0, flex: 1,
          overflowX: 'auto',
        }}
      >
        {TABS.map(tab => {
          const active = view === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              style={{
                position: 'relative',
                padding: isMobile ? '0 10px' : '0 16px',
                border: 'none',
                background: 'transparent',
                color: active ? 'var(--text)' : 'var(--text3)',
                fontSize: isMobile ? 12 : 13,
                fontWeight: active ? 600 : 400,
                cursor: 'pointer',
                letterSpacing: active ? '-0.01em' : '0',
                transition: 'color 0.12s',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--text2)'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--text3)'; }}
            >
              {isMobile ? tab.short : tab.label}
              {active && (
                <span style={{
                  position: 'absolute',
                  bottom: 0,
                  left: isMobile ? 4 : 8,
                  right: isMobile ? 4 : 8,
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
