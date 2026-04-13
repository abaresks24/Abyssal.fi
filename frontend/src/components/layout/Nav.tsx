'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { ConnectButton } from '@/components/ui/ConnectButton';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useTranslation } from '@/contexts/LanguageContext';
import { type Locale, LOCALE_LABELS } from '@/lib/i18n';

export type View = 'trade' | 'portfolio' | 'lp' | 'marketplace' | 'leaderboard' | 'analytics' | 'docs';

interface NavProps {
  view: View;
  setView: (v: View) => void;
}

// ── Dark/light toggle ─────────────────────────────────────────────────────────

function ThemeToggle() {
  const { t } = useTranslation();
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    const isDark = saved !== 'light';
    setDark(isDark);
    document.documentElement.classList.toggle('light', !isDark);
  }, []);

  const toggle = useCallback(() => {
    const newDark = !dark;
    setDark(newDark);
    document.documentElement.classList.toggle('light', !newDark);
    localStorage.setItem('theme', newDark ? 'dark' : 'light');
  }, [dark]);

  return (
    <button
      onClick={toggle}
      title={dark ? t.theme.toLight : t.theme.toDark}
      style={{
        width: 30, height: 30,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg3)', border: '1px solid var(--border2)',
        borderRadius: 6, cursor: 'pointer', color: 'var(--text2)',
        flexShrink: 0, marginRight: 4, fontSize: 14, lineHeight: 1,
        transition: 'all 0.18s ease',
      }}
    >
      {dark ? '☀' : '☾'}
    </button>
  );
}

// ── Language selector ─────────────────────────────────────────────────────────

const LOCALES: Locale[] = ['en', 'fr', 'es', 'zh'];

function LanguageSelector() {
  const { locale, setLocale } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', marginRight: 4 }}>
      <button
        onClick={() => setOpen(v => !v)}
        title="Language / Langue"
        style={{
          width: 30, height: 30,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: open ? 'var(--bg3)' : 'var(--bg3)',
          border: `1px solid ${open ? 'var(--cyan)' : 'var(--border2)'}`,
          borderRadius: 6, cursor: 'pointer', color: 'var(--text2)',
          flexShrink: 0, fontSize: 15, lineHeight: 1,
          transition: 'all 0.18s ease',
        }}
      >
        🌐
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
          background: 'var(--bg2)', border: '1px solid var(--border2)',
          borderRadius: 8, overflow: 'hidden', zIndex: 1000, minWidth: 140,
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        }}>
          {LOCALES.map(l => (
            <button
              key={l}
              onClick={() => { setLocale(l); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '9px 14px',
                background: locale === l ? 'rgba(85,195,233,0.1)' : 'transparent',
                border: 'none', textAlign: 'left', cursor: 'pointer',
                fontSize: 12, color: locale === l ? 'var(--cyan)' : 'var(--text)',
                fontWeight: locale === l ? 600 : 400,
                transition: 'background 0.12s',
              }}
            >
              <span>{LOCALE_LABELS[l]}</span>
              {locale === l && <span style={{ fontSize: 10, color: 'var(--cyan)' }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Nav ───────────────────────────────────────────────────────────────────────

export const Nav = React.memo(function Nav({ view, setView }: NavProps) {
  const { isMobile } = useBreakpoint();
  const { t } = useTranslation();

  const TABS: { id: View; label: string; short: string }[] = [
    { id: 'trade',       label: t.nav.trade,       short: t.nav.tradeShort       },
    { id: 'portfolio',   label: t.nav.portfolio,   short: t.nav.portfolioShort   },
    { id: 'lp',          label: t.nav.lp,          short: t.nav.lpShort          },
    { id: 'marketplace', label: t.nav.marketplace, short: t.nav.marketplaceShort },
    { id: 'leaderboard', label: t.nav.leaderboard, short: t.nav.leaderboardShort },
    { id: 'analytics',   label: t.nav.analytics,   short: t.nav.analyticsShort   },
    { id: 'docs',        label: t.nav.docs,        short: t.nav.docsShort        },
  ];

  return (
    <nav style={{
      height: isMobile ? 48 : 52,
      background: 'var(--bg1)', borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center',
      padding: isMobile ? '0 10px' : '0 20px',
      gap: 0, flexShrink: 0, zIndex: 10,
    }}>
      {/* Logo */}
      <div
        onClick={() => setView('trade')}
        style={{
          display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 9,
          cursor: 'pointer', marginRight: isMobile ? 8 : 28, flexShrink: 0,
        }}
      >
        <div style={{
          position: 'relative',
          width: isMobile ? 26 : 32, height: isMobile ? 26 : 32,
        }}>
          <Image
            src="/logo.svg" alt="Abyssal"
            width={isMobile ? 26 : 32} height={isMobile ? 26 : 32}
            style={{ borderRadius: '50%' }}
          />
          {/* Subtle glow ring */}
          <div style={{
            position: 'absolute', inset: -2,
            borderRadius: '50%',
            border: '1px solid rgba(85,195,233,0.15)',
            animation: 'pulse-glow 3s ease-in-out infinite',
            pointerEvents: 'none',
          }} />
        </div>
        {!isMobile && (
          <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em', color: 'var(--text)' }}>
            Abyssal<span style={{ color: 'var(--cyan)' }}>.fi</span>
          </span>
        )}
      </div>

      {/* Tabs */}
      <div
        className="hide-scrollbar"
        style={{ display: 'flex', alignItems: 'stretch', height: '100%', gap: 0, flex: 1, overflowX: 'auto' }}
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
                border: 'none', background: 'transparent',
                color: active ? 'var(--text)' : 'var(--text3)',
                fontSize: isMobile ? 12 : 13,
                fontWeight: active ? 600 : 400,
                cursor: 'pointer', letterSpacing: active ? '-0.01em' : '0',
                transition: 'color 0.15s', whiteSpace: 'nowrap', flexShrink: 0,
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--text2)'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--text3)'; }}
            >
              {isMobile ? tab.short : tab.label}
              {active && (
                <span style={{
                  position: 'absolute', bottom: 0,
                  left: isMobile ? 4 : 8, right: isMobile ? 4 : 8,
                  height: 2,
                  background: 'linear-gradient(90deg, transparent, var(--cyan), transparent)',
                  borderRadius: '2px 2px 0 0',
                }} />
              )}
            </button>
          );
        })}
      </div>

      <LanguageSelector />
      <ThemeToggle />
      <ConnectButton />
    </nav>
  );
});
