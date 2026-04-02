'use client';
import Link from 'next/link';

export function LaunchButton() {
  return (
    <div style={{
      position: 'relative', zIndex: 2,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      paddingBottom: '52px', gap: 12,
    }}>
      <Link href="/app" style={{ textDecoration: 'none' }}>
        <button
          style={{
            padding: '14px 52px',
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: '#0a121c',
            background: '#55c3e9',
            border: 'none',
            borderRadius: 10,
            cursor: 'pointer',
            boxShadow: '0 0 32px rgba(85,195,233,0.45), 0 4px 16px rgba(0,0,0,0.4)',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 0 52px rgba(85,195,233,0.70), 0 8px 24px rgba(0,0,0,0.4)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 0 32px rgba(85,195,233,0.45), 0 4px 16px rgba(0,0,0,0.4)';
          }}
        >
          Launch app
        </button>
      </Link>
      <span style={{ fontSize: 11.5, color: 'rgba(180,210,230,0.45)', letterSpacing: '0.02em' }}>
        Devnet — testnet only
      </span>
    </div>
  );
}
