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

// ── Trade view (3-column) ─────────────────────────────────────────────────────

function LeftPanel() {
  return (
    <div style={{
      width: 220,
      background: 'var(--bg1)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      flexShrink: 0,
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

function CenterPanel() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <TradingViewChart />
      </div>
      <div style={{ height: 280, borderTop: '1px solid var(--border)', flexShrink: 0, overflowY: 'auto', background: 'var(--bg1)' }}>
        <OptionBuilder />
      </div>
    </div>
  );
}

function RightPanel() {
  return (
    <div style={{
      width: 240,
      background: 'var(--bg1)',
      borderLeft: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      <div style={{ flex: 1, minHeight: 0, borderBottom: '1px solid var(--border)' }}>
        <OrderBook />
      </div>
      <div style={{ height: 260, flexShrink: 0 }}>
        <TradeHistory />
      </div>
    </div>
  );
}

function TradeView() {
  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
      <LeftPanel />
      <div style={{ flex: 1, overflow: 'hidden', background: 'var(--bg)' }}>
        <CenterPanel />
      </div>
      <RightPanel />
    </div>
  );
}

// ── Root layout ───────────────────────────────────────────────────────────────

export default function TradingLayout() {
  const [view, setView] = useState<View>('trade');

  return (
    <OptionBuilderProvider>
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Nav view={view} setView={setView} />

        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {view === 'trade'       && <TradeView />}
          {view === 'portfolio'   && <Portfolio />}
          {view === 'lp'          && <LPVault />}
          {view === 'leaderboard' && <Leaderboard />}
          {view === 'analytics'   && <Analytics />}
        </div>
      </div>
    </OptionBuilderProvider>
  );
}
