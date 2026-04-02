import Image from 'next/image';
import { LaunchButton } from '@/components/landing/LaunchButton';

export default function LandingPage() {
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
      {/* Vignette */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.35) 100%)',
        pointerEvents: 'none',
      }} />

      {/* Bottom fade */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 220,
        background: 'linear-gradient(to top, rgba(5,12,22,0.75) 0%, transparent 100%)',
        pointerEvents: 'none',
      }} />

      {/* ── Logo + name — centred ── */}
      <div style={{
        position: 'relative', zIndex: 2,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 20,
        /* Shift slightly above true centre so button at bottom feels balanced */
        marginBottom: 120,
      }}>
        <Image
          src="/logo.svg"
          alt="Abyssal logo"
          width={96}
          height={96}
          style={{
            borderRadius: '50%',
            filter: 'drop-shadow(0 0 28px rgba(85,195,233,0.75)) drop-shadow(0 0 8px rgba(85,195,233,0.40))',
          }}
        />

        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontFamily: 'IBM Plex Sans, Inter, sans-serif',
            fontWeight: 800,
            fontSize: 52,
            letterSpacing: '-0.04em',
            lineHeight: 1,
            color: '#ffffff',
            textShadow: '0 0 40px rgba(85,195,233,0.35), 0 4px 32px rgba(0,0,0,0.80)',
          }}>
            Abyssal<span style={{ color: '#55c3e9' }}>.fi</span>
          </div>

          <p style={{
            marginTop: 12,
            fontSize: 14,
            color: 'rgba(210,235,250,0.85)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            fontWeight: 500,
            textShadow: '0 2px 16px rgba(0,0,0,0.70)',
          }}>
            Decentralized options on Solana
          </p>
        </div>
      </div>

      {/* ── Launch button — pinned to bottom ── */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 2 }}>
        <LaunchButton />
      </div>
    </main>
  );
}
