'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslation } from '@/contexts/LanguageContext';

type Chapter = 'intro' | 'perps' | 'perps-funding' | 'options-basics' | 'calls' | 'puts' | 'greeks' | 'strategies' | 'abyssal';

function useChapters() {
  const { t } = useTranslation();
  return [
    { id: 'intro' as Chapter,         title: t.learn.whatAreDerivatives,    section: t.learn.fundamentals },
    { id: 'perps' as Chapter,         title: t.learn.perpetualFutures,      section: t.learn.perpetuals },
    { id: 'perps-funding' as Chapter, title: t.learn.fundingRate,           section: t.learn.perpetuals },
    { id: 'options-basics' as Chapter,title: t.learn.optionsFundamentals,   section: t.learn.options },
    { id: 'calls' as Chapter,         title: t.learn.callOptions,           section: t.learn.options },
    { id: 'puts' as Chapter,          title: t.learn.putOptions,            section: t.learn.options },
    { id: 'greeks' as Chapter,        title: t.learn.theGreeks,             section: t.learn.options },
    { id: 'strategies' as Chapter,    title: t.learn.optionStrategies,      section: t.learn.strategies },
    { id: 'abyssal' as Chapter,       title: t.learn.tradingOnAbyssal,      section: t.learn.abyssal },
  ];
}

function SideNav({ active, onSelect, chapters }: { active: Chapter; onSelect: (s: Chapter) => void; chapters: { id: Chapter; title: string; section: string }[] }) {
  const { t } = useTranslation();
  let lastSection = '';
  return (
    <nav style={{
      width: 240, flexShrink: 0, padding: '24px 0',
      borderRight: '1px solid var(--border)',
      overflowY: 'auto',
    }}>
      <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px', marginBottom: 24 }}>
        <Image src="/logo.svg" alt="Abyssal" width={28} height={28} style={{ borderRadius: '50%' }} />
        <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>
          Abyssal<span style={{ color: 'var(--cyan)' }}>.fi</span>
        </span>
      </Link>
      <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0 20px', marginBottom: 12 }}>
        {t.learn.title}
      </div>
      {chapters.map((ch, i) => {
        const showSection = ch.section !== lastSection;
        lastSection = ch.section;
        return (
          <React.Fragment key={ch.id}>
            {showSection && i > 0 && (
              <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '14px 20px 6px', fontWeight: 600 }}>
                {ch.section}
              </div>
            )}
            <button
              onClick={() => onSelect(ch.id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '7px 20px', border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: active === ch.id ? 600 : 400,
                color: active === ch.id ? 'var(--cyan)' : 'var(--text2)',
                background: active === ch.id ? 'var(--cyan-dim)' : 'transparent',
                borderLeft: active === ch.id ? '2px solid var(--cyan)' : '2px solid transparent',
                transition: 'all 0.12s',
              }}
            >
              {ch.title}
            </button>
          </React.Fragment>
        );
      })}
      <div style={{ padding: '20px', marginTop: 16, borderTop: '1px solid var(--border)', display: 'flex', gap: 12 }}>
        <Link href="/app" style={{ fontSize: 12, color: 'var(--cyan)', textDecoration: 'none' }}>{t.common.backToApp}</Link>
        <Link href="/docs" style={{ fontSize: 12, color: 'var(--text3)', textDecoration: 'none' }}>{t.docs.title}</Link>
      </div>
    </nav>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16, color: 'var(--text)', letterSpacing: '-0.01em' }}>{children}</h2>;
}
function H3({ children }: { children: React.ReactNode }) {
  return <h3 style={{ fontSize: 17, fontWeight: 600, marginTop: 28, marginBottom: 12, color: 'var(--text)' }}>{children}</h3>;
}
function P({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.8, marginBottom: 16, ...style }}>{children}</p>;
}
function Li({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 10, fontSize: 14, color: 'var(--text2)', lineHeight: 1.7 }}>
      <span style={{ color: 'var(--cyan)', flexShrink: 0, marginTop: 2 }}>&#8226;</span>
      <span>{children}</span>
    </div>
  );
}
function Highlight({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8,
      padding: '16px 20px', marginBottom: 16,
      borderLeft: `3px solid ${color ?? 'var(--cyan)'}`,
    }}>
      {children}
    </div>
  );
}
function Example({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px', marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--cyan)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>{children}</div>
    </div>
  );
}

function IntroChapter() {
  return (<>
    <H2>What Are Derivatives?</H2>
    <P>
      A <strong>derivative</strong> is a financial contract whose value is derived from an underlying asset.
      Rather than buying or selling the asset directly, you trade a contract that tracks its price.
    </P>
    <P>
      The two most common types of derivatives in crypto are <strong>perpetual futures</strong> (perps)
      and <strong>options</strong>. This guide will teach you both, starting with perps and building
      up to options trading on Abyssal.fi.
    </P>
    <Highlight>
      <P style={{ marginBottom: 0 }}>
        <strong>Why derivatives?</strong> They allow you to hedge risk, gain leveraged exposure,
        or profit from volatility &mdash; all without holding the underlying asset.
      </P>
    </Highlight>
  </>);
}

function PerpsChapter() {
  return (<>
    <H2>Perpetual Futures</H2>
    <P>
      A <strong>perpetual future</strong> (or &ldquo;perp&rdquo;) is a derivative contract that lets you
      bet on the price of an asset going up or down, with leverage, and <strong>no expiry date</strong>.
    </P>
    <H3>Long vs Short</H3>
    <Li><strong>Long:</strong> You profit when the price goes up. Example: long BTC at $80,000 with 5x leverage &mdash; a 2% price increase gives you a 10% gain.</Li>
    <Li><strong>Short:</strong> You profit when the price goes down. Example: short ETH at $3,000 with 3x leverage &mdash; a 5% price drop gives you a 15% gain.</Li>
    <H3>Leverage</H3>
    <P>
      Leverage amplifies both gains and losses. With 10x leverage, a 10% move in the underlying
      results in a 100% gain or loss on your margin. If the price moves against you by enough,
      your position gets <strong>liquidated</strong> (forced closed).
    </P>
    <Example title="Example: Long BTC Perp">
      You open a long BTC perp at $80,000 with $1,000 margin and 10x leverage.
      Your position size is $10,000. BTC rises to $84,000 (+5%).
      <br/><br/>
      <strong>P&L: $10,000 &times; 5% = +$500 (50% return on margin)</strong>
    </Example>
    <Highlight color="var(--amber)">
      <P style={{ marginBottom: 0 }}>
        <strong>Caution:</strong> Leverage is a double-edged sword. While it amplifies profits,
        it equally amplifies losses. Never risk more than you can afford to lose.
      </P>
    </Highlight>
  </>);
}

function PerpsFundingChapter() {
  return (<>
    <H2>Funding Rate Mechanism</H2>
    <P>
      Since perps have no expiry, they need a mechanism to keep the contract price close to the
      spot price. This is called the <strong>funding rate</strong>.
    </P>
    <H3>How Funding Works</H3>
    <Li>If the perp price is <strong>above</strong> spot price: longs pay shorts (positive funding)</Li>
    <Li>If the perp price is <strong>below</strong> spot price: shorts pay longs (negative funding)</Li>
    <Li>Funding is exchanged between traders every 8 hours (varies by exchange)</Li>
    <P>
      This creates an economic incentive for the perp price to converge with the spot price.
      When the perp trades at a premium, the funding rate becomes positive, making it expensive
      to hold longs &mdash; which pushes the price down.
    </P>
    <Example title="Funding Rate Example">
      Funding rate: +0.01% every 8h (positive = longs pay shorts).
      <br/>
      You&apos;re long $10,000 BTC. Every 8 hours, you pay $10,000 &times; 0.01% = $1.
      <br/><br/>
      Over a month (~90 funding periods): you pay ~$90 in funding.
      This is the &ldquo;cost of carry&rdquo; for holding a leveraged long position.
    </Example>
  </>);
}

function OptionsBasicsChapter() {
  return (<>
    <H2>Options Fundamentals</H2>
    <P>
      An <strong>option</strong> gives you the <strong>right, but not the obligation</strong>, to buy or sell
      an asset at a specific price (the <strong>strike</strong>) before or at a specific date (the <strong>expiry</strong>).
    </P>
    <H3>Key Terminology</H3>
    <Li><strong>Premium:</strong> The price you pay to buy an option</Li>
    <Li><strong>Strike Price:</strong> The price at which the option can be exercised</Li>
    <Li><strong>Expiry:</strong> The date the option expires</Li>
    <Li><strong>Underlying:</strong> The asset the option is based on (BTC, ETH, etc.)</Li>
    <Li><strong>ITM (In The Money):</strong> Option has intrinsic value (profitable to exercise)</Li>
    <Li><strong>OTM (Out of The Money):</strong> Option has no intrinsic value</Li>
    <Li><strong>ATM (At The Money):</strong> Strike price equals the current spot price</Li>
    <H3>European vs American</H3>
    <P>
      <strong>European options</strong> (used by Abyssal.fi) can only be exercised at expiry.
      <strong>American options</strong> can be exercised any time before expiry.
      European options are simpler to price and are standard in crypto options markets.
    </P>
    <Highlight>
      <P style={{ marginBottom: 0 }}>
        <strong>Key insight:</strong> The most you can lose when buying an option is the premium you paid.
        This makes options attractive for hedging and controlled-risk speculation.
      </P>
    </Highlight>
  </>);
}

function CallsChapter() {
  return (<>
    <H2>Call Options</H2>
    <P>
      A <strong>call option</strong> gives you the right to buy the underlying asset at the strike price.
      You buy a call when you expect the price to <strong>go up</strong>.
    </P>
    <H3>Payoff</H3>
    <P>At expiry, the call option payoff is:</P>
    <Highlight>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--cyan)', textAlign: 'center' }}>
        Payoff = max(0, Spot Price &minus; Strike Price) &times; Size
      </div>
    </Highlight>
    <Li>If spot &gt; strike: the option is ITM, and you profit the difference</Li>
    <Li>If spot &le; strike: the option expires worthless, you lose only the premium</Li>
    <Example title="Example: BTC Call Option">
      You buy a BTC call option with strike $85,000 for a premium of $500.
      <br/><br/>
      <strong>Scenario A:</strong> BTC is at $90,000 at expiry.
      <br/>Payoff = ($90,000 &minus; $85,000) &times; 1 = <span style={{ color: 'var(--green)' }}>+$5,000</span>
      <br/>Profit = $5,000 &minus; $500 premium = <span style={{ color: 'var(--green)' }}>+$4,500</span>
      <br/><br/>
      <strong>Scenario B:</strong> BTC is at $80,000 at expiry.
      <br/>Payoff = $0 (option expires worthless)
      <br/>Loss = <span style={{ color: 'var(--red)' }}>&minus;$500</span> (only the premium)
    </Example>
  </>);
}

function PutsChapter() {
  return (<>
    <H2>Put Options</H2>
    <P>
      A <strong>put option</strong> gives you the right to sell the underlying asset at the strike price.
      You buy a put when you expect the price to <strong>go down</strong>, or to hedge an existing position.
    </P>
    <H3>Payoff</H3>
    <Highlight>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--cyan)', textAlign: 'center' }}>
        Payoff = max(0, Strike Price &minus; Spot Price) &times; Size
      </div>
    </Highlight>
    <Li>If spot &lt; strike: the option is ITM, and you profit the difference</Li>
    <Li>If spot &ge; strike: the option expires worthless, you lose only the premium</Li>
    <Example title="Example: ETH Put Option (Hedging)">
      You hold 10 ETH at $3,000 each ($30,000 total). You&apos;re worried about a crash.
      <br/>You buy a put with strike $2,800 for $200 premium.
      <br/><br/>
      <strong>If ETH drops to $2,400:</strong>
      <br/>Portfolio loss: 10 &times; ($3,000 &minus; $2,400) = &minus;$6,000
      <br/>Put payoff: ($2,800 &minus; $2,400) &times; 10 = +$4,000
      <br/>Net loss: <span style={{ color: 'var(--amber)' }}>&minus;$2,200</span> instead of &minus;$6,000
      <br/><br/>
      The put acted as insurance, limiting your downside.
    </Example>
  </>);
}

function GreeksChapter() {
  return (<>
    <H2>The Greeks</H2>
    <P>
      The &ldquo;Greeks&rdquo; measure how an option&apos;s price changes in response to various factors.
      Understanding them is essential for managing option positions.
    </P>
    <H3>Delta (&Delta;)</H3>
    <P>
      How much the option price changes for a $1 move in the underlying.
      A delta of 0.5 means the option gains $0.50 when the asset rises $1.
    </P>
    <Li>Calls: delta ranges from 0 to 1 (positive exposure)</Li>
    <Li>Puts: delta ranges from &minus;1 to 0 (negative exposure)</Li>
    <Li>ATM options have delta near &plusmn;0.5</Li>
    <H3>Gamma (&Gamma;)</H3>
    <P>
      The rate of change of delta. High gamma means delta changes rapidly &mdash; the option becomes
      much more (or less) sensitive to price moves. Gamma is highest for ATM options near expiry.
    </P>
    <H3>Theta (&Theta;)</H3>
    <P>
      Time decay &mdash; how much value the option loses per day as expiry approaches.
      Theta is always negative for option buyers (you lose value over time) and positive for
      option sellers (you earn value over time). This accelerates near expiry.
    </P>
    <H3>Vega (V)</H3>
    <P>
      Sensitivity to implied volatility. High vega means the option price is very sensitive to
      changes in market expectations of future volatility. Options with longer expiry have higher vega.
    </P>
    <Highlight>
      <P style={{ marginBottom: 0 }}>
        <strong>Practical tip:</strong> When buying options, theta works against you (time decay).
        When selling options, theta works for you. This is why option sellers are sometimes called
        &ldquo;theta farmers.&rdquo;
      </P>
    </Highlight>
  </>);
}

function StrategiesChapter() {
  return (<>
    <H2>Option Strategies</H2>
    <P>
      By combining calls and puts at different strikes, you can create strategies with specific
      risk/reward profiles.
    </P>
    <H3>Long Call (Bullish)</H3>
    <Li>Buy a call option</Li>
    <Li>Max loss: premium paid</Li>
    <Li>Max gain: unlimited</Li>
    <Li>Best when: you expect a significant upward move</Li>
    <H3>Long Put (Bearish)</H3>
    <Li>Buy a put option</Li>
    <Li>Max loss: premium paid</Li>
    <Li>Max gain: strike price &minus; premium (if asset goes to $0)</Li>
    <Li>Best when: you expect a significant downward move</Li>
    <H3>Protective Put (Hedging)</H3>
    <Li>Hold the underlying asset + buy a put</Li>
    <Li>Acts as insurance against downside</Li>
    <Li>Cost: the put premium reduces your upside</Li>
    <Li>Best when: you want to protect an existing long position</Li>
    <H3>Straddle (Volatility Play)</H3>
    <Li>Buy a call AND a put at the same strike</Li>
    <Li>Profits from large moves in either direction</Li>
    <Li>Max loss: total premium of both options</Li>
    <Li>Best when: you expect high volatility but are unsure of direction</Li>
    <H3>Covered Call (Income)</H3>
    <Li>Hold the underlying asset + sell a call</Li>
    <Li>Earn premium income at the cost of capped upside</Li>
    <Li>Best when: you expect the asset to stay flat or rise slightly</Li>
  </>);
}

function AbyssalChapter() {
  return (<>
    <H2>Trading on Abyssal.fi</H2>
    <P>
      Now that you understand the fundamentals, here&apos;s how to start trading options on Abyssal.fi.
    </P>
    <H3>1. Connect Your Wallet</H3>
    <P>
      Click &ldquo;Connect Wallet&rdquo; to connect via Phantom, Solflare, or any Solana wallet.
      On devnet, you&apos;ll automatically receive 1000 USDP and SOL for transaction fees on your first connection.
    </P>
    <H3>2. Select a Market</H3>
    <P>
      Choose from 15 available markets in the left panel. Each market shows the current price,
      24h change, and implied volatility.
    </P>
    <H3>3. Build Your Option</H3>
    <P>Use the Option Builder in the right panel to configure your trade:</P>
    <Li>Choose Buy or Sell</Li>
    <Li>Choose Call or Put</Li>
    <Li>Select your strike price and expiry</Li>
    <Li>Set your position size</Li>
    <Li>Review premium, Greeks, and payoff chart</Li>
    <H3>4. Execute the Trade</H3>
    <P>
      Click the buy/sell button and approve the transaction in your wallet. The trade executes
      atomically: premium is paid, position is created, and an NFT is minted to your wallet as
      proof of ownership.
    </P>
    <H3>5. Manage Your Positions</H3>
    <P>
      View your open positions in the Portfolio tab. You can sell positions before expiry
      (the NFT transfers to the buyer) or wait for automatic settlement at expiry.
    </P>
    <Highlight color="var(--green)">
      <P style={{ marginBottom: 0 }}>
        <strong>Ready to trade?</strong> Head to the{' '}
        <Link href="/app" style={{ color: 'var(--cyan)', textDecoration: 'none' }}>trading app</Link>
        {' '}and start with a small position to get familiar with the interface.
      </P>
    </Highlight>
  </>);
}

const CHAPTER_COMPONENTS: Record<Chapter, React.FC> = {
  intro: IntroChapter,
  perps: PerpsChapter,
  'perps-funding': PerpsFundingChapter,
  'options-basics': OptionsBasicsChapter,
  calls: CallsChapter,
  puts: PutsChapter,
  greeks: GreeksChapter,
  strategies: StrategiesChapter,
  abyssal: AbyssalChapter,
};

export default function LearnPage() {
  const [chapter, setChapter] = useState<Chapter>('intro');
  const chapters = useChapters();
  const Content = CHAPTER_COMPONENTS[chapter];

  const currentIdx = chapters.findIndex(c => c.id === chapter);
  const prev = currentIdx > 0 ? chapters[currentIdx - 1] : null;
  const next = currentIdx < chapters.length - 1 ? chapters[currentIdx + 1] : null;

  return (
    <div style={{
      height: '100dvh', display: 'flex', overflow: 'hidden',
      background: 'var(--bg)', color: 'var(--text)',
      fontFamily: 'var(--font)',
    }}>
      <SideNav active={chapter} onSelect={setChapter} chapters={chapters} />
      <main style={{ flex: 1, overflowY: 'auto', padding: '40px 48px', maxWidth: 800 }}>
        <Content />

        {/* Navigation */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', marginTop: 40,
          paddingTop: 20, borderTop: '1px solid var(--border)',
        }}>
          {prev ? (
            <button
              onClick={() => setChapter(prev.id)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text3)', fontSize: 13, padding: 0,
              }}
            >
              &larr; {prev.title}
            </button>
          ) : <span />}
          {next && (
            <button
              onClick={() => setChapter(next.id)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--cyan)', fontSize: 13, fontWeight: 600, padding: 0,
              }}
            >
              {next.title} &rarr;
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
