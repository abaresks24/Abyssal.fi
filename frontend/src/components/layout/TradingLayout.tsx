'use client';
import React, { useState } from 'react';
import { Nav, type View } from './Nav';
import { MarketSelector } from '@/components/market/MarketSelector';
import { IVPanel } from '@/components/market/IVPanel';
import { KeeperStatus } from '@/components/market/KeeperStatus';
import { OrderBook } from '@/components/market/OrderBook';
import { TradeHistory } from '@/components/market/TradeHistory';
import { TradingViewChart } from '@/components/chart/TradingViewChart';
import { OptionBuilder } from '@/components/builder/OptionBuilder';
import { OptionBuilderProvider } from '@/hooks/useOptionBuilder';
import { LPVault } from '@/components/lp/LPVault';
import { Portfolio } from '@/components/portfolio/Portfolio';
import { Leaderboard } from '@/components/leaderboard/Leaderboard';
import { Analytics } from '@/components/analytics/Analytics';
import { Marketplace } from '@/components/marketplace/Marketplace';
import Docs from '@/components/docs/Docs';
import { useBreakpoint } from '@/hooks/useBreakpoint';

// ── Shared panel pieces ───────────────────────────────────────────────────────

function LeftPanel() {
  return (
    <div style={{
      width: 220, background: 'var(--bg1)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden', flexShrink: 0,
    }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <MarketSelector />
        <div style={{ height: 1, background: 'var(--border)' }} />
        <IVPanel />
        <div style={{ height: 1, background: 'var(--border)' }} />
        <KeeperStatus />
      </div>
    </div>
  );
}

function ChartOnly() {
  return (
    <div style={{ height: '100%', position: 'relative' }}>
      <TradingViewChart />
    </div>
  );
}

function RightPanel() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'row',
      borderLeft: '1px solid var(--border)',
      overflow: 'hidden', flexShrink: 0,
    }}>
      {/* Order book + trade history */}
      <div style={{
        width: 220, background: 'var(--bg1)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{ flex: 1, minHeight: 0, borderBottom: '1px solid var(--border)' }}>
          <OrderBook />
        </div>
        <div style={{ height: 220, flexShrink: 0 }}>
          <TradeHistory />
        </div>
      </div>

      {/* Option builder */}
      <div style={{
        width: 260, background: 'var(--bg1)',
        overflowY: 'auto', overflowX: 'hidden',
      }}>
        <OptionBuilder />
      </div>
    </div>
  );
}

// ── Desktop (≥1024px) ─────────────────────────────────────────────────────────

function DesktopTradeView() {
  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
      <LeftPanel />
      <div style={{ flex: 1, overflow: 'hidden', background: 'var(--bg)', minWidth: 0 }}>
        <ChartOnly />
      </div>
      <RightPanel />
    </div>
  );
}

// ── Tablet (768–1023px) ───────────────────────────────────────────────────────

function TabletTradeView() {
  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
      <div style={{ flex: 1, overflow: 'hidden', background: 'var(--bg)', minWidth: 0 }}>
        <ChartOnly />
      </div>
      <RightPanel />
    </div>
  );
}

// ── Mobile (<768px) ───────────────────────────────────────────────────────────

type MobileTab = 'chart' | 'build' | 'book' | 'market';

const MOBILE_TABS: { id: MobileTab; label: string }[] = [
  { id: 'chart',  label: 'Chart'  },
  { id: 'build',  label: 'Build'  },
  { id: 'book',   label: 'Book'   },
  { id: 'market', label: 'Market' },
];

function MobileTradeView() {
  const [tab, setTab] = useState<MobileTab>('chart');

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      {/* Sub-tab bar */}
      <div style={{
        display: 'flex', background: 'var(--bg1)',
        borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        {MOBILE_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: '9px 0', border: 'none',
              background: 'transparent',
              color: tab === t.id ? 'var(--cyan)' : 'var(--text3)',
              fontSize: 12, fontWeight: tab === t.id ? 600 : 400,
              cursor: 'pointer',
              borderBottom: `2px solid ${tab === t.id ? 'var(--cyan)' : 'transparent'}`,
              transition: 'color 0.12s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content area */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tab === 'chart' && (
          <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            <TradingViewChart />
          </div>
        )}
        {tab === 'build' && (
          <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg1)' }}>
            <OptionBuilder />
          </div>
        )}
        {tab === 'book' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div style={{ flex: 1, minHeight: 0 }}>
              <OrderBook />
            </div>
            <div style={{ height: 180, borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              <TradeHistory />
            </div>
          </div>
        )}
        {tab === 'market' && (
          <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg1)' }}>
            <MarketSelector />
            <div style={{ height: 1, background: 'var(--border)' }} />
            <IVPanel />
            <div style={{ height: 1, background: 'var(--border)' }} />
            <KeeperStatus />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Root layout ───────────────────────────────────────────────────────────────

export default function TradingLayout() {
  const [view, setView] = useState<View>('trade');
  const { isMobile, isTablet } = useBreakpoint();

  return (
    <OptionBuilderProvider>
      <div style={{
        height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        position: 'relative',
      }}>
        {/* Ambient gradient orb — subtle depth cue */}
        <div style={{
          position: 'absolute', top: -200, right: -200,
          width: 600, height: 600,
          background: 'radial-gradient(circle, rgba(85,195,233,0.03) 0%, transparent 70%)',
          pointerEvents: 'none', zIndex: 0,
        }} />
        <div style={{
          position: 'absolute', bottom: -300, left: -200,
          width: 700, height: 700,
          background: 'radial-gradient(circle, rgba(2,199,123,0.02) 0%, transparent 70%)',
          pointerEvents: 'none', zIndex: 0,
        }} />

        <Nav view={view} setView={setView} />

        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative', zIndex: 1 }}>
          {view === 'trade' && (
            isMobile  ? <MobileTradeView />  :
            isTablet  ? <TabletTradeView />  :
                        <DesktopTradeView />
          )}
          {view === 'portfolio'    && <Portfolio />}
          {view === 'lp'           && <LPVault />}
          {view === 'marketplace'  && <Marketplace />}
          {view === 'leaderboard'  && <Leaderboard />}
          {view === 'analytics'    && <Analytics />}
          {view === 'docs'         && <Docs />}
        </div>
      </div>
    </OptionBuilderProvider>
  );
}
