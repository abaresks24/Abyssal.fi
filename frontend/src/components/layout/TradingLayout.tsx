'use client';
import React from 'react';
import { Nav } from './Nav';
import { TickerBar } from './TickerBar';
import { MarketSelector } from '@/components/market/MarketSelector';
import { IVPanel } from '@/components/market/IVPanel';
import { KeeperStatus } from '@/components/market/KeeperStatus';
import { OrderBook } from '@/components/market/OrderBook';
import { TradeHistory } from '@/components/market/TradeHistory';
import { TradingViewChart } from '@/components/chart/TradingViewChart';
import { OptionBuilder } from '@/components/builder/OptionBuilder';
import { OptionBuilderProvider } from '@/hooks/useOptionBuilder';

function CenterPanel() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Chart — fills all available space; TradingViewChart manages its own header */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <TradingViewChart />
      </div>

      {/* Option Builder — fixed 280px height below chart */}
      <div style={{ height: 280, borderTop: '1px solid var(--border)', flexShrink: 0, overflowY: 'auto', background: 'var(--bg1)' }}>
        <OptionBuilder />
      </div>

    </div>
  );
}

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
      {/* Order Book — top, flex 1 */}
      <div style={{ flex: 1, minHeight: 0, borderBottom: '1px solid var(--border)' }}>
        <OrderBook />
      </div>
      {/* Options Flow / Trade History — bottom, fixed height */}
      <div style={{ height: 260, flexShrink: 0 }}>
        <TradeHistory />
      </div>
    </div>
  );
}

export default function TradingLayout() {
  return (
    <OptionBuilderProvider>
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Nav />
        <TickerBar />
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
          <LeftPanel />
          <div style={{ flex: 1, overflow: 'hidden', background: 'var(--bg)' }}>
            <CenterPanel />
          </div>
          <RightPanel />
        </div>
      </div>
    </OptionBuilderProvider>
  );
}
