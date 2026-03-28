import Link from 'next/link';
import Image from 'next/image';
import { AbyssalLogo } from '@/components/AbyssalLogo';

const FEATURES = [
  {
    icon: '⚡',
    title: 'European Options',
    desc: 'Cash-settled at expiry in USDC. No early exercise complexity.',
  },
  {
    icon: '📐',
    title: 'Black-Scholes + AFVR',
    desc: 'On-chain IV surface updated every 5 minutes by a live keeper.',
  },
  {
    icon: '🌊',
    title: 'AMM Liquidity',
    desc: 'Provide liquidity to any option series and earn fees + theta.',
  },
  {
    icon: '🛡️',
    title: 'Delta-Hedged Vault',
    desc: 'Net portfolio delta is hedged via Pacifica perpetuals automatically.',
  },
];

const STATS = [
  { label: 'Chain', value: 'Solana' },
  { label: 'Settlement', value: 'USDC' },
  { label: 'Trading fee', value: '0.05%' },
  { label: 'Markets', value: 'BTC · ETH · SOL' },
];

export default function LandingPage() {
  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden bg-black">

      {/* ── Background image ───────────────────────────────────────────────── */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/Landing.png"
          alt="Abyssal deep sea"
          fill
          priority
          quality={95}
          style={{ objectFit: 'cover', objectPosition: 'center top' }}
        />
        {/* Dark gradient overlay — heavier at the bottom so text is readable */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/50 to-black/90" />
      </div>

      {/* ── Nav ────────────────────────────────────────────────────────────── */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-2.5">
          <AbyssalLogo size={32} />
          <span className="text-xl font-bold tracking-tight text-white">
            Abyssal<span className="text-cyan-400">.fi</span>
          </span>
        </div>
        <div className="flex items-center gap-6 text-sm text-white/60">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a
            href="https://solscan.io/account/CBkvR8SeN6j8RQKB7dSxG3dza2v71XHmWEe8LgfMW1hG?cluster=devnet"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            Contract
          </a>
          <Link
            href="/app"
            className="px-4 py-1.5 rounded-lg border border-cyan-400/60 text-cyan-300 text-sm font-medium hover:bg-cyan-400/10 transition-colors"
          >
            Launch app
          </Link>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center text-center px-6 pt-12 pb-32">

        {/* Badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-1.5 text-xs font-medium text-cyan-300">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
          Live on Solana Devnet
        </div>

        {/* Title */}
        <h1 className="max-w-3xl text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.1] tracking-tight text-white">
          Options trading,{' '}
          <span className="bg-gradient-to-r from-cyan-300 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
            deep on-chain
          </span>
        </h1>

        {/* Subtitle */}
        <p className="mt-6 max-w-xl text-lg text-white/60 leading-relaxed">
          European options on BTC, ETH and SOL — priced by a live AFVR
          IV surface, settled in USDC, counterparty risk borne by the vault.
        </p>

        {/* CTA */}
        <div className="mt-10 flex flex-col sm:flex-row items-center gap-4">
          <Link
            href="/app"
            className="group relative inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-8 py-3.5 text-sm font-semibold text-black shadow-lg shadow-cyan-500/30 transition-all hover:bg-cyan-400 hover:shadow-cyan-400/40 hover:scale-[1.02] active:scale-[0.98]"
          >
            Launch app
            <svg
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
          <a
            href="https://solscan.io/account/CBkvR8SeN6j8RQKB7dSxG3dza2v71XHmWEe8LgfMW1hG?cluster=devnet"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 backdrop-blur-sm px-8 py-3.5 text-sm font-medium text-white/80 transition-all hover:bg-white/10 hover:text-white"
          >
            View contract
            <svg className="h-3.5 w-3.5 opacity-60" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 10L10 2M10 2H5M10 2v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        </div>

        {/* Stats row */}
        <div className="mt-16 flex flex-wrap justify-center gap-8">
          {STATS.map(({ label, value }) => (
            <div key={label} className="text-center">
              <div className="text-lg font-semibold font-mono text-cyan-300">{value}</div>
              <div className="mt-0.5 text-xs text-white/40 uppercase tracking-widest">{label}</div>
            </div>
          ))}
        </div>
      </main>

      {/* ── Features section ───────────────────────────────────────────────── */}
      <section
        id="features"
        className="relative z-10 bg-gradient-to-b from-transparent to-[#050508] px-6 pb-24"
      >
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-10 text-center text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400/70">
            How it works
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {FEATURES.map(({ icon, title, desc }) => (
              <div
                key={title}
                className="rounded-2xl border border-white/8 bg-white/[0.04] backdrop-blur-md p-6 transition-colors hover:border-cyan-500/30 hover:bg-white/[0.06]"
              >
                <div className="mb-3 text-2xl">{icon}</div>
                <div className="mb-1.5 font-semibold text-white">{title}</div>
                <div className="text-sm text-white/50 leading-relaxed">{desc}</div>
              </div>
            ))}
          </div>

          {/* Bottom CTA */}
          <div className="mt-12 text-center">
            <Link
              href="/app"
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-10 py-3.5 text-sm font-semibold text-black shadow-lg shadow-cyan-500/20 transition-all hover:bg-cyan-400 hover:scale-[1.02] active:scale-[0.98]"
            >
              Start trading
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="relative z-10 bg-[#050508] border-t border-white/5 px-8 py-6 flex items-center justify-between text-xs text-white/30">
        <span className="inline-flex items-center gap-2">
          <AbyssalLogo size={16} />
          Abyssal<span className="text-cyan-500/60">.fi</span> — On-chain options on Solana
        </span>
        <span>Devnet · CBkvR8…W1hG</span>
      </footer>
    </div>
  );
}
