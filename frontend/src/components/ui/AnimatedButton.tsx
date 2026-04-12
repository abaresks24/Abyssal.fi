'use client';

import React from 'react';
import Link from 'next/link';

interface AnimatedButtonProps {
  label: string;
  href: string;
  variant?: 'primary' | 'secondary' | 'outline';
}

export function AnimatedButton({ label, href, variant = 'primary' }: AnimatedButtonProps) {
  const isPrimary = variant === 'primary';
  const isOutline = variant === 'outline';

  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div
        className="animated-btn"
        style={{
          position: 'relative',
          cursor: 'pointer',
          padding: '14px 36px',
          minWidth: 150,
          borderRadius: 50,
          overflow: 'hidden',
          textAlign: 'center',
          fontWeight: 600,
          fontSize: 15,
          letterSpacing: '0.02em',
          border: isOutline
            ? '1px solid rgba(255,255,255,0.25)'
            : isPrimary
              ? '1px solid rgba(85,195,233,0.4)'
              : '1px solid rgba(255,255,255,0.15)',
          background: isOutline
            ? 'rgba(255,255,255,0.05)'
            : isPrimary
              ? 'rgba(85,195,233,0.15)'
              : 'rgba(255,255,255,0.06)',
          color: isPrimary ? '#55c3e9' : '#e8f2fa',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
        onMouseEnter={e => {
          const el = e.currentTarget;
          el.style.transform = 'translateY(-2px)';
          if (isPrimary) {
            el.style.background = 'rgba(85,195,233,0.25)';
            el.style.borderColor = 'rgba(85,195,233,0.6)';
            el.style.boxShadow = '0 0 32px rgba(85,195,233,0.3), 0 8px 24px rgba(0,0,0,0.3)';
          } else {
            el.style.background = 'rgba(255,255,255,0.1)';
            el.style.borderColor = 'rgba(255,255,255,0.3)';
            el.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)';
          }
        }}
        onMouseLeave={e => {
          const el = e.currentTarget;
          el.style.transform = 'translateY(0)';
          el.style.boxShadow = 'none';
          if (isPrimary) {
            el.style.background = 'rgba(85,195,233,0.15)';
            el.style.borderColor = 'rgba(85,195,233,0.4)';
          } else if (isOutline) {
            el.style.background = 'rgba(255,255,255,0.05)';
            el.style.borderColor = 'rgba(255,255,255,0.25)';
          } else {
            el.style.background = 'rgba(255,255,255,0.06)';
            el.style.borderColor = 'rgba(255,255,255,0.15)';
          }
        }}
      >
        <span style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {label}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ transition: 'transform 0.2s' }}>
            <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
    </Link>
  );
}
