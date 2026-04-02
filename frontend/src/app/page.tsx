import Image from 'next/image';
import { LaunchButton } from '@/components/landing/LaunchButton';

export default function LandingPage() {
  return (
    <main style={{
      position: 'relative',
      width: '100vw',
      height: '100dvh',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}>
      {/* Background */}
      <Image
        src="/landing.png"
        alt="Abyssal background"
        fill
        priority
        quality={95}
        style={{ objectFit: 'cover', objectPosition: 'center' }}
      />

      {/* Vignette */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 50% 40%, transparent 30%, rgba(0,0,0,0.52) 100%)',
        pointerEvents: 'none',
      }} />

      {/* Top fade */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 200,
        background: 'linear-gradient(to bottom, rgba(5,12,22,0.70) 0%, transparent 100%)',
        pointerEvents: 'none',
      }} />

      {/* Bottom fade */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 240,
        background: 'linear-gradient(to top, rgba(5,12,22,0.88) 0%, transparent 100%)',
        pointerEvents: 'none',
      }} />

      {/* Logo + name */}
      <div style={{
        position: 'relative', zIndex: 2,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        paddingTop: '48px', gap: 16,
      }}>
        <Image
          src="/logo.svg"
          alt="Abyssal logo"
          width={68}
          height={68}
          style={{
            borderRadius: '50%',
            filter: 'drop-shadow(0 0 20px rgba(85,195,233,0.60))',
          }}
        />
        <div style={{ textAlign: 'center' }}>
          <span style={{
            fontFamily: 'Inter, sans-serif',
            fontWeight: 800,
            fontSize: 34,
            letterSpacing: '-0.03em',
            color: '#ffffff',
            textShadow: '0 2px 28px rgba(0,0,0,0.65)',
          }}>
            Abyssal<span style={{ color: '#55c3e9' }}>.fi</span>
          </span>
          <p style={{
            marginTop: 8,
            fontSize: 13,
            color: 'rgba(200,225,245,0.70)',
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            fontWeight: 500,
            textShadow: '0 1px 10px rgba(0,0,0,0.55)',
          }}>
            Decentralized options on Solana
          </p>
        </div>
      </div>

      {/* Launch button */}
      <LaunchButton />
    </main>
  );
}
