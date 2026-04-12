'use client';

import Image from 'next/image';
import { AnimatedButton } from '@/components/ui/AnimatedButton';
import { useTranslation } from '@/contexts/LanguageContext';
import { type Locale, LOCALE_LABELS } from '@/lib/i18n';
import { useState, useEffect, useRef } from 'react';

const LOCALES: Locale[] = ['en', 'fr', 'es', 'zh'];

function LandingLanguageSelector() {
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
    <div ref={ref} style={{ position: 'absolute', top: 20, right: 20, zIndex: 10 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: 36, height: 36,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 8, cursor: 'pointer', color: 'rgba(255,255,255,0.7)',
          fontSize: 16, backdropFilter: 'blur(8px)',
          transition: 'all 0.15s',
        }}
      >
        🌐
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0,
          background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8, overflow: 'hidden', zIndex: 1000, minWidth: 140,
          backdropFilter: 'blur(12px)',
        }}>
          {LOCALES.map(l => (
            <button
              key={l}
              onClick={() => { setLocale(l); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '9px 14px',
                background: locale === l ? 'rgba(85,195,233,0.12)' : 'transparent',
                border: 'none', textAlign: 'left', cursor: 'pointer',
                fontSize: 13, color: locale === l ? '#55c3e9' : 'rgba(255,255,255,0.8)',
                fontWeight: locale === l ? 600 : 400,
                transition: 'background 0.12s',
              }}
            >
              <span>{LOCALE_LABELS[l]}</span>
              {locale === l && <span style={{ fontSize: 10 }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LandingPage() {
  const { t } = useTranslation();

  return (
    <main style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundImage: 'url(/Landing.png)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    }}>
      {/* Language selector */}
      <LandingLanguageSelector />

      {/* Vignette overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.5) 100%)',
        pointerEvents: 'none',
      }} />

      {/* Bottom gradient */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 300,
        background: 'linear-gradient(to top, rgba(5,12,22,0.9) 0%, rgba(5,12,22,0.4) 50%, transparent 100%)',
        pointerEvents: 'none',
      }} />

      {/* Top subtle gradient */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 120,
        background: 'linear-gradient(to bottom, rgba(5,12,22,0.6) 0%, transparent 100%)',
        pointerEvents: 'none',
      }} />

      {/* Content */}
      <div style={{
        position: 'relative', zIndex: 2,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 24,
        maxWidth: 600,
        padding: '0 24px',
      }}>
        {/* Logo */}
        <Image
          src="/logo.svg"
          alt="Abyssal logo"
          width={88}
          height={88}
          style={{
            borderRadius: '50%',
            filter: 'drop-shadow(0 0 32px rgba(85,195,233,0.6)) drop-shadow(0 0 12px rgba(85,195,233,0.3))',
          }}
        />

        {/* Title */}
        <div style={{ textAlign: 'center' }}>
          <h1 style={{
            fontFamily: 'IBM Plex Sans, Inter, sans-serif',
            fontWeight: 800,
            fontSize: 56,
            letterSpacing: '-0.04em',
            lineHeight: 1,
            color: '#ffffff',
            margin: 0,
          }}>
            Abyssal<span style={{ color: '#55c3e9' }}>.fi</span>
          </h1>

          <p style={{
            marginTop: 16,
            fontSize: 15,
            color: 'rgba(210,235,250,0.8)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontWeight: 500,
            lineHeight: 1.5,
          }}>
            {t.landing.tagline}
          </p>

          <p style={{
            marginTop: 12,
            fontSize: 14,
            color: 'rgba(210,235,250,0.5)',
            lineHeight: 1.6,
            maxWidth: 440,
            marginLeft: 'auto',
            marginRight: 'auto',
          }}>
            {t.landing.description}
          </p>
        </div>

        {/* Buttons */}
        <div style={{
          display: 'flex',
          gap: 14,
          marginTop: 12,
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}>
          <AnimatedButton label={t.landing.launchApp} href="/app" variant="primary" />
          <AnimatedButton label={t.landing.learn} href="/learn" variant="secondary" />
          <AnimatedButton label={t.landing.docs} href="/docs" variant="outline" />
        </div>

        {/* Stats bar */}
        <div style={{
          display: 'flex',
          gap: 32,
          marginTop: 16,
          padding: '16px 28px',
          background: 'rgba(255,255,255,0.04)',
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}>
          {[
            { label: t.landing.markets, value: '15' },
            { label: t.landing.settlement, value: 'USDP' },
            { label: t.landing.network, value: 'Solana' },
          ].map(({ label, value }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: 18, fontWeight: 700,
                fontFamily: 'IBM Plex Mono, monospace',
                color: '#55c3e9',
              }}>
                {value}
              </div>
              <div style={{
                fontSize: 11,
                color: 'rgba(210,235,250,0.45)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginTop: 2,
              }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        position: 'absolute', bottom: 20, left: 0, right: 0, zIndex: 2,
        textAlign: 'center',
        fontSize: 11, color: 'rgba(210,235,250,0.25)',
      }}>
        {t.landing.footer}
      </div>
    </main>
  );
}
