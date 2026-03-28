'use client';
import React, { useState } from 'react';
import { Nav } from './Nav';
import { TickerBar } from './TickerBar';
import { MarketSelector } from '@/components/market/MarketSelector';
import { IVPanel } from '@/components/market/IVPanel';
import { KeeperStatus } from '@/components/market/KeeperStatus';
import { ChartHeader } from '@/components/chart/ChartHeader';
import { CandlestickChart } from '@/components/chart/CandlestickChart';
import { TimeframeSelector, TIMEFRAMES } from '@/components/chart/TimeframeSelector';
import type { TfInterval } from '@/components/chart/TimeframeSelector';
import { OptionBuilder } from '@/components/builder/OptionBuilder';
import { OptionBuilderProvider, useOptionBuilder } from '@/hooks/useOptionBuilder';
import { useOHLCV } from '@/hooks/useOHLCV';
import { usePacificaWS } from '@/hooks/usePacificaWS';
import { useAFVR } from '@/hooks/useAFVR';

function CenterPanel() {
  const { market, strike } = useOptionBuilder();
  const [timeframe, setTimeframe] = useState<TfInterval>('1h');
  const intervalMs = TIMEFRAMES.find(t => t.interval === timeframe)?.ms ?? 3_600_000;

  const { candles, isLoading, loadMore } = useOHLCV(market, timeframe);
  const { price: spot } = usePacificaWS(market);
  const { iv } = useAFVR(market);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header row: asset info + timeframe selector */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          <ChartHeader market={market} />
        </div>
        <div style={{ borderLeft: '1px solid var(--border)', padding: '0 6px' }}>
          <TimeframeSelector current={timeframe} onChange={setTimeframe} />
        </div>
      </div>

      {/* Chart — fills all remaining space */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {isLoading ? (
          <div style={{
            height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 12,
          }}>
            Connecting to Pacifica…
          </div>
        ) : (
          <CandlestickChart
            candles={candles}
            currentPrice={spot}
            selectedStrike={strike > 0 ? strike : null}
            intervalMs={intervalMs}
            onLoadMore={loadMore}
          />
        )}
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
      width: 340,
      background: 'var(--bg1)',
      borderLeft: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <OptionBuilder />
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
