'use client';
import React, { useEffect, useRef, useState } from 'react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useOptionBuilder } from '@/hooks/useOptionBuilder';
import { CandlestickChart } from '@/components/chart/CandlestickChart';
import { ChartHeader } from '@/components/chart/ChartHeader';
import { TimeframeSelector, TIMEFRAMES } from '@/components/chart/TimeframeSelector';
import type { TfInterval } from '@/components/chart/TimeframeSelector';
import { useOHLCV } from '@/hooks/useOHLCV';
import { usePacificaWS } from '@/hooks/usePacificaWS';
import { pacificaClient } from '@/lib/pacificaClient';
import type { Candle } from '@/types';

// TradingView resolution string → Pacifica interval
const TV_TO_PAC: Record<string, string> = {
  '1': '1m', '3': '3m', '5': '5m', '15': '15m', '30': '30m',
  '60': '1h', '120': '2h', '240': '4h', '480': '8h', '720': '12h', 'D': '1d',
};

const SUPPORTED_RESOLUTIONS = ['1', '3', '5', '15', '30', '60', '120', '240', '480', '720', 'D'];

// Pricescale by market (decimal places = log10(pricescale))
const PRICESCALE: Record<string, number> = {
  BTC: 10, ETH: 100, SOL: 1000,
  NVDA: 100, TSLA: 100, PLTR: 1000, CRCL: 1000, HOOD: 1000, SP500: 10,
  XAU: 10, XAG: 100, PAXG: 10, PLATINUM: 10, NATGAS: 10000, COPPER: 10000,
};

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TradingView?: { widget: new (config: any) => TVWidgetHandle };
  }
}

interface TVWidgetHandle {
  remove(): void;
}

// Unsub callbacks keyed by TV subscriber UID (module-level, survives re-renders)
const barUnsubMap = new Map<string, () => void>();

// ─── Fallback: TradingView lightweight-charts ────────────────────────────────

function FallbackChart() {
  const { market, strike } = useOptionBuilder();
  const [timeframe, setTimeframe] = useState<TfInterval>('1h');
  const intervalMs = TIMEFRAMES.find(t => t.interval === timeframe)?.ms ?? 3_600_000;
  const { candles, isLoading, loadMore } = useOHLCV(market, timeframe);
  const { price: spot } = usePacificaWS(market);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header + timeframe selector (no custom toolbar) */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          <ChartHeader market={market} />
        </div>
        <div style={{ borderLeft: '1px solid var(--border)', padding: '0 6px' }}>
          <TimeframeSelector current={timeframe} onChange={setTimeframe} />
        </div>
      </div>
      {/* Chart — lightweight-charts handles all interactions natively */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {isLoading ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <LoadingSpinner size={36} />
            <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 12 }}>Connecting to Pacifica…</span>
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

// ─── Main component ───────────────────────────────────────────────────────────

type LibStatus = 'checking' | 'available' | 'unavailable';

export function TradingViewChart() {
  const { market } = useOptionBuilder();
  const containerRef = useRef<HTMLDivElement>(null);
  const containerIdRef = useRef(`tv_chart_${Math.random().toString(36).slice(2)}`);
  const widgetRef = useRef<TVWidgetHandle | null>(null);
  const [libStatus, setLibStatus] = useState<LibStatus>('checking');

  // Check if charting_library files are present
  useEffect(() => {
    fetch('/charting_library/charting_library.js', { method: 'HEAD' })
      .then(r => setLibStatus(r.ok ? 'available' : 'unavailable'))
      .catch(() => setLibStatus('unavailable'));
  }, []);

  // Build TV widget when library is available
  useEffect(() => {
    if (libStatus !== 'available') return;

    const symbol = `${market}-PERP`;
    const base = market;

    const datafeed = {
      onReady: (callback: (config: unknown) => void) => {
        setTimeout(() => callback({
          supported_resolutions: SUPPORTED_RESOLUTIONS,
          supports_marks: false,
          supports_timescale_marks: false,
          supports_time: true,
        }), 0);
      },

      searchSymbols: () => { /* disabled */ },

      resolveSymbol: (
        sym: string,
        onResolve: (info: unknown) => void,
        _onError: (err: string) => void,
      ) => {
        const b = sym.replace('-PERP', '');
        setTimeout(() => onResolve({
          name: sym,
          full_name: sym,
          description: `${b} Perpetual`,
          type: 'crypto',
          session: '24x7',
          timezone: 'Etc/UTC',
          ticker: sym,
          exchange: 'Pacifica',
          listed_exchange: 'Pacifica',
          format: 'price',
          minmov: 1,
          pricescale: PRICESCALE[b] ?? 100,
          has_intraday: true,
          has_no_volume: true,
          intraday_multipliers: ['1', '3', '5', '15', '30', '60', '120', '240', '480', '720'],
          supported_resolutions: SUPPORTED_RESOLUTIONS,
          volume_precision: 3,
          data_status: 'streaming',
        }), 0);
      },

      getBars: async (
        symbolInfo: { ticker: string },
        resolution: string,
        periodParams: { from: number; to: number; firstDataRequest: boolean },
        onHistoryCallback: (bars: unknown[], meta: { noData: boolean }) => void,
        onErrorCallback: (err: string) => void,
      ) => {
        const interval = TV_TO_PAC[resolution] ?? '1h';
        const sym = symbolInfo.ticker;
        try {
          const params = new URLSearchParams({
            symbol: sym,
            interval,
            start_time: (periodParams.from * 1000).toString(),
            end_time: (periodParams.to * 1000).toString(),
            limit: '1000',
          });
          const res = await fetch(`/api/pacifica/v1/kline/mark?${params}`);
          if (!res.ok) { onHistoryCallback([], { noData: true }); return; }
          const json = await res.json();
          if (!json.success || !Array.isArray(json.data) || json.data.length === 0) {
            onHistoryCallback([], { noData: true });
            return;
          }
          type KlineItem = { t: number; o: string; h: string; l: string; c: string; v: string };
          const bars = (json.data as KlineItem[]).map(k => ({
            time: k.t,            // milliseconds — TV JS API accepts ms
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c),
            volume: parseFloat(k.v),
          }));
          onHistoryCallback(bars, { noData: false });
        } catch (e) {
          onErrorCallback(String(e));
        }
      },

      subscribeBars: (
        symbolInfo: { ticker: string },
        resolution: string,
        onRealtimeCallback: (bar: unknown) => void,
        subscriberUID: string,
      ) => {
        const interval = TV_TO_PAC[resolution] ?? '1h';
        const sym = symbolInfo.ticker;
        pacificaClient.connect();
        const unsub = pacificaClient.subscribeCandle(sym, interval, (candle: Candle) => {
          onRealtimeCallback({
            time: candle.timestamp,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
          });
        });
        barUnsubMap.set(subscriberUID, unsub);
      },

      unsubscribeBars: (subscriberUID: string) => {
        const unsub = barUnsubMap.get(subscriberUID);
        if (unsub) { unsub(); barUnsubMap.delete(subscriberUID); }
      },

      getServerTime: (callback: (time: number) => void) => {
        callback(Math.floor(Date.now() / 1000));
      },
    };

    const initWidget = () => {
      if (!window.TradingView || !containerRef.current) return;
      if (widgetRef.current) { widgetRef.current.remove(); widgetRef.current = null; }

      widgetRef.current = new window.TradingView.widget({
        container: containerIdRef.current,
        library_path: '/charting_library/',
        locale: 'en',
        datafeed,
        symbol,
        interval: '60',
        fullscreen: false,
        autosize: true,
        theme: 'Dark',
        toolbar_bg: '#0a121c',
        overrides: {
          'paneProperties.background': '#0a121c',
          'paneProperties.backgroundType': 'solid',
          'paneProperties.vertGridProperties.color': 'rgba(255,255,255,0.04)',
          'paneProperties.horzGridProperties.color': 'rgba(255,255,255,0.04)',
          'scalesProperties.textColor': '#8898a8',
          'scalesProperties.lineColor': 'rgba(255,255,255,0.08)',
          'mainSeriesProperties.candleStyle.upColor': '#02c77b',
          'mainSeriesProperties.candleStyle.downColor': '#eb365a',
          'mainSeriesProperties.candleStyle.borderUpColor': '#02c77b',
          'mainSeriesProperties.candleStyle.borderDownColor': '#eb365a',
          'mainSeriesProperties.candleStyle.wickUpColor': '#02c77b',
          'mainSeriesProperties.candleStyle.wickDownColor': '#eb365a',
        },
        loading_screen: { backgroundColor: '#0a121c', foregroundColor: '#55c3e9' },
        disabled_features: [
          'header_symbol_search',
          'header_compare',
          'symbol_search_hot_key',
          'go_to_date',
        ],
        enabled_features: [
          'study_templates',
          'side_toolbar_in_fullscreen_mode',
          'dont_show_boolean_study_arguments',
          'hide_last_na_study_output',
          'move_logo_to_main_pane',
        ],
        time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Etc/UTC',
        // Symbol is fixed — market changes re-mount the widget
        symbol_search_complete: undefined,
      });
    };

    // Load script if not yet present
    if (window.TradingView) {
      initWidget();
    } else {
      const existing = document.querySelector('script[data-tv-lib]');
      if (existing) {
        // Script is loading, wait for it
        existing.addEventListener('load', initWidget, { once: true });
      } else {
        const script = document.createElement('script');
        script.src = '/charting_library/charting_library.js';
        script.dataset.tvLib = '1';
        script.async = true;
        script.onload = initWidget;
        document.head.appendChild(script);
      }
    }

    return () => {
      widgetRef.current?.remove();
      widgetRef.current = null;
    };
  // Re-create widget when market changes (new symbol)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libStatus, market]);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (libStatus === 'checking') {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <LoadingSpinner size={36} />
        <span style={{ color: '#526a82', fontSize: 12 }}>Initializing chart…</span>
      </div>
    );
  }

  // No library → fall back to our lightweight-charts component
  if (libStatus === 'unavailable') {
    return <FallbackChart />;
  }

  return (
    <div
      id={containerIdRef.current}
      ref={containerRef}
      style={{ width: '100%', height: '100%' }}
    />
  );
}
