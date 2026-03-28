'use client';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Candle } from '@/types';
import { sma, ema, bollingerBands, rsi, macd, toLWCSeries } from '@/lib/indicators';

// ── Theme ──────────────────────────────────────────────────────────────────
const T = {
  bg:        '#0a121c',
  grid:      'rgba(255,255,255,0.04)',
  axis:      '#526a82',
  border:    'rgba(255,255,255,0.07)',
  crosshair: 'rgba(120,145,170,0.6)',
  xhairBg:   '#1e3048',
  up:        '#02c77b',
  down:      '#eb365a',
  cyan:      '#55c3e9',
  amber:     '#ecca5a',
};

// ── Indicator definitions ──────────────────────────────────────────────────
const IND_DEFS = [
  { id: 'ma7',   label: 'MA 7',   color: '#f0b90b' },
  { id: 'ma25',  label: 'MA 25',  color: '#e91e63' },
  { id: 'ma99',  label: 'MA 99',  color: '#2196f3' },
  { id: 'ema12', label: 'EMA 12', color: '#9c27b0' },
  { id: 'ema26', label: 'EMA 26', color: '#ff9800' },
  { id: 'bb',    label: 'BB 20',  color: '#55c3e9' },
  { id: 'vol',   label: 'Vol',    color: '#526a82' },
  { id: 'rsi',   label: 'RSI 14', color: '#55c3e9' },
  { id: 'macd',  label: 'MACD',   color: '#02c77b' },
] as const;

type IndicatorId = (typeof IND_DEFS)[number]['id'];

// ── Props ──────────────────────────────────────────────────────────────────
interface Props {
  candles:        Candle[];
  currentPrice:   number;
  selectedStrike: number | null;
  intervalMs:     number;
  onLoadMore?:    () => void;
}

// ── Component ──────────────────────────────────────────────────────────────
export function CandlestickChart({ candles, currentPrice, selectedStrike, onLoadMore }: Props) {
  const mainRef  = useRef<HTMLDivElement>(null);
  const rsiRef   = useRef<HTMLDivElement>(null);
  const macdRef  = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const charts   = useRef<{ main?: any; rsi?: any; macd?: any }>({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const series   = useRef<Record<string, any>>({});

  const [active, setActive] = useState<Set<IndicatorId>>(new Set(['vol']));
  const loadMoreCooldown = useRef(false);

  const toggleIndicator = useCallback((id: IndicatorId) => {
    setActive(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const showRSI  = active.has('rsi');
  const showMACD = active.has('macd');

  // ── Init / destroy charts ─────────────────────────────────────────────
  useEffect(() => {
    if (!mainRef.current) return;
    let destroyed = false;

    (async () => {
      const {
        createChart, CrosshairMode, LineStyle,
      } = await import('lightweight-charts');
      if (destroyed) return;

      const baseOpts = {
        layout:  { background: { color: T.bg }, textColor: T.axis, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 },
        grid:    { vertLines: { color: T.grid }, horzLines: { color: T.grid } },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: T.crosshair, width: 1 as 1, style: LineStyle.Dashed, labelBackgroundColor: T.xhairBg },
          horzLine: { color: T.crosshair, width: 1 as 1, style: LineStyle.Dashed, labelBackgroundColor: T.xhairBg },
        },
        rightPriceScale: { borderColor: T.border },
        timeScale: { borderColor: T.border, timeVisible: true, secondsVisible: false },
        handleScroll:   { mouseWheel: true, pressedMouseMove: true },
        handleScale:    { mouseWheel: true, pinch: true },
      };

      // ── Main chart ──
      const main = createChart(mainRef.current!, { ...baseOpts, width: mainRef.current!.clientWidth, height: mainRef.current!.clientHeight });
      charts.current.main = main;

      // Candlesticks
      series.current.candle = main.addCandlestickSeries({
        upColor: T.up, downColor: T.down,
        borderUpColor: T.up, borderDownColor: T.down,
        wickUpColor: T.up, wickDownColor: T.down,
      });

      // Volume (overlay, separate scale)
      series.current.vol = main.addHistogramSeries({
        priceFormat:  { type: 'volume' },
        priceScaleId: 'vol',
      });
      main.priceScale('vol').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

      // Load-more on scroll to left edge
      main.timeScale().subscribeVisibleLogicalRangeChange((range: { from: number; to: number } | null) => {
        if (!range || loadMoreCooldown.current) return;
        if (range.from < 5 && onLoadMore) {
          loadMoreCooldown.current = true;
          onLoadMore();
          setTimeout(() => { loadMoreCooldown.current = false; }, 2000);
        }
      });

      // ── RSI chart ──
      if (rsiRef.current) {
        const rsiChart = createChart(rsiRef.current, {
          ...baseOpts,
          width: rsiRef.current.clientWidth,
          height: rsiRef.current.clientHeight,
          crosshair: { ...baseOpts.crosshair, horzLine: { ...baseOpts.crosshair.horzLine, labelVisible: true } },
          rightPriceScale: { ...baseOpts.rightPriceScale, scaleMargins: { top: 0.1, bottom: 0.1 } },
          timeScale: { ...baseOpts.timeScale, visible: false },
        });
        charts.current.rsi = rsiChart;
        series.current.rsiLine = rsiChart.addLineSeries({ color: T.cyan, lineWidth: 1 as 1 });
        // RSI overbought/oversold bands
        series.current.rsi70 = rsiChart.addLineSeries({ color: 'rgba(235,54,90,0.4)', lineWidth: 1 as 1, lineStyle: LineStyle.Dashed });
        series.current.rsi30 = rsiChart.addLineSeries({ color: 'rgba(2,199,123,0.4)', lineWidth: 1 as 1, lineStyle: LineStyle.Dashed });

        // Sync time scale
        main.timeScale().subscribeVisibleTimeRangeChange((range) => {
          if (range) rsiChart.timeScale().setVisibleRange(range);
        });
        rsiChart.timeScale().subscribeVisibleTimeRangeChange((range) => {
          if (range) main.timeScale().setVisibleRange(range);
        });
      }

      // ── MACD chart ──
      if (macdRef.current) {
        const macdChart = createChart(macdRef.current, {
          ...baseOpts,
          width: macdRef.current.clientWidth,
          height: macdRef.current.clientHeight,
          timeScale: { ...baseOpts.timeScale, visible: true },
          rightPriceScale: { ...baseOpts.rightPriceScale, scaleMargins: { top: 0.1, bottom: 0.1 } },
        });
        charts.current.macd = macdChart;
        series.current.macdLine   = macdChart.addLineSeries({ color: T.cyan,  lineWidth: 1 as 1 });
        series.current.macdSig    = macdChart.addLineSeries({ color: '#ff9800', lineWidth: 1 as 1 });
        series.current.macdHist   = macdChart.addHistogramSeries({ color: T.up });

        main.timeScale().subscribeVisibleTimeRangeChange((range) => {
          if (range) macdChart.timeScale().setVisibleRange(range);
        });
        macdChart.timeScale().subscribeVisibleTimeRangeChange((range) => {
          if (range) main.timeScale().setVisibleRange(range);
        });
      }

      // ── Resize observer ──
      const ro = new ResizeObserver(() => {
        if (mainRef.current)  main.applyOptions({ width: mainRef.current.clientWidth, height: mainRef.current.clientHeight });
        if (rsiRef.current && charts.current.rsi)   charts.current.rsi.applyOptions({ width: rsiRef.current.clientWidth, height: rsiRef.current.clientHeight });
        if (macdRef.current && charts.current.macd) charts.current.macd.applyOptions({ width: macdRef.current.clientWidth, height: macdRef.current.clientHeight });
      });
      if (mainRef.current)  ro.observe(mainRef.current);
      if (rsiRef.current)   ro.observe(rsiRef.current);
      if (macdRef.current)  ro.observe(macdRef.current);

      return () => {
        ro.disconnect();
        main.remove();
        charts.current.rsi?.remove();
        charts.current.macd?.remove();
        charts.current = {};
        series.current = {};
      };
    })().then(cleanup => {
      if (destroyed && cleanup) cleanup();
    });

    return () => { destroyed = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRSI, showMACD]); // reinit when pane visibility changes

  // ── Feed candle data ──────────────────────────────────────────────────
  useEffect(() => {
    const s = series.current;
    if (!s.candle || candles.length === 0) return;

    const closes = candles.map(c => c.close);

    // Candles
    s.candle.setData(candles.map(c => ({
      time:  Math.floor(c.timestamp / 1000) as unknown as number,
      open:  c.open, high: c.high, low: c.low, close: c.close,
    })));

    // Volume
    if (s.vol) {
      s.vol.setData(candles.map(c => ({
        time:  Math.floor(c.timestamp / 1000) as unknown as number,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(2,199,123,0.35)' : 'rgba(235,54,90,0.35)',
      })));
    }

    // MA / EMA overlay series on main chart
    const ma = (p: number) => toLWCSeries(candles, sma(closes, p));
    const em = (p: number) => toLWCSeries(candles, ema(closes, p));
    if (s.ma7)   s.ma7.setData(ma(7));
    if (s.ma25)  s.ma25.setData(ma(25));
    if (s.ma99)  s.ma99.setData(ma(99));
    if (s.ema12) s.ema12.setData(em(12));
    if (s.ema26) s.ema26.setData(em(26));

    // BB
    if (s.bbUpper || s.bbMid || s.bbLower) {
      const bb = bollingerBands(closes);
      if (s.bbUpper) s.bbUpper.setData(toLWCSeries(candles, bb.map(b => b.upper)));
      if (s.bbMid)   s.bbMid.setData(toLWCSeries(candles, bb.map(b => b.mid)));
      if (s.bbLower) s.bbLower.setData(toLWCSeries(candles, bb.map(b => b.lower)));
    }

    // RSI
    if (s.rsiLine) {
      const rsiVals = rsi(closes);
      s.rsiLine.setData(toLWCSeries(candles, rsiVals));
      // Flat 70 / 30 lines
      const flat = (v: number) => candles.map(c => ({ time: Math.floor(c.timestamp / 1000) as unknown as number, value: v }));
      s.rsi70?.setData(flat(70));
      s.rsi30?.setData(flat(30));
    }

    // MACD
    if (s.macdLine) {
      const { macdLine, signalLine, hist } = macd(closes);
      s.macdLine.setData(toLWCSeries(candles, macdLine));
      s.macdSig.setData(toLWCSeries(candles, signalLine));
      s.macdHist.setData(candles
        .map((c, i) => ({ time: Math.floor(c.timestamp / 1000) as unknown as number, value: hist[i] ?? 0, color: (hist[i] ?? 0) >= 0 ? T.up : T.down }))
        .filter(d => d.value !== 0));
    }

    // Current price line
    if (currentPrice > 0) {
      s.candle.createPriceLine?.({
        price: currentPrice, color: T.cyan, lineWidth: 1,
        lineStyle: 2, axisLabelVisible: true, title: '',
      });
    }

    // Strike line
    if (selectedStrike && selectedStrike > 0) {
      s.candle.createPriceLine?.({
        price: selectedStrike, color: T.amber, lineWidth: 1,
        lineStyle: 2, axisLabelVisible: true, title: `K ${selectedStrike.toLocaleString()}`,
      });
    }
  }, [candles, currentPrice, selectedStrike]);

  // ── Add/remove overlay indicator series when toggled ───────────────────
  useEffect(() => {
    const chart = charts.current.main;
    if (!chart) return;
    import('lightweight-charts').then(({ LineStyle }) => {
      const addLine = (key: string, color: string) => {
        if (!series.current[key]) {
          series.current[key] = chart.addLineSeries({ color, lineWidth: 1 as 1, lineStyle: LineStyle.Solid, priceLineVisible: false, lastValueVisible: false });
        }
      };
      const removeSeries = (key: string) => {
        if (series.current[key]) {
          try { chart.removeSeries(series.current[key]); } catch { /* ignore */ }
          delete series.current[key];
        }
      };

      if (active.has('ma7'))  { addLine('ma7',  '#f0b90b'); } else removeSeries('ma7');
      if (active.has('ma25')) { addLine('ma25', '#e91e63'); } else removeSeries('ma25');
      if (active.has('ma99')) { addLine('ma99', '#2196f3'); } else removeSeries('ma99');
      if (active.has('ema12')){ addLine('ema12','#9c27b0'); } else removeSeries('ema12');
      if (active.has('ema26')){ addLine('ema26','#ff9800'); } else removeSeries('ema26');

      if (active.has('bb')) {
        addLine('bbUpper', 'rgba(85,195,233,0.7)');
        addLine('bbMid',   'rgba(85,195,233,0.4)');
        addLine('bbLower', 'rgba(85,195,233,0.7)');
      } else {
        removeSeries('bbUpper'); removeSeries('bbMid'); removeSeries('bbLower');
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }}>

      {/* ── Indicator toolbar ── */}
      <div style={{
        display: 'flex', gap: 4, padding: '4px 8px', flexShrink: 0,
        borderBottom: `1px solid ${T.border}`, flexWrap: 'wrap',
      }}>
        {IND_DEFS.map(({ id, label, color }) => {
          const on = active.has(id);
          return (
            <button
              key={id}
              onClick={() => toggleIndicator(id)}
              style={{
                padding: '2px 8px', fontSize: 10, borderRadius: 3, cursor: 'pointer',
                fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.04em',
                background: on ? `${color}22` : 'transparent',
                color:      on ? color : T.axis,
                border:     `1px solid ${on ? color : 'rgba(255,255,255,0.1)'}`,
                transition: 'all 0.1s',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Main chart ── */}
      <div ref={mainRef} style={{ flex: 1, minHeight: 0 }} />

      {/* ── RSI pane ── */}
      {showRSI && (
        <div style={{ flexShrink: 0, height: 120, borderTop: `1px solid ${T.border}`, position: 'relative' }}>
          <span style={{ position: 'absolute', top: 4, left: 8, fontSize: 9, color: T.cyan, fontFamily: "'IBM Plex Mono', monospace", zIndex: 1, pointerEvents: 'none' }}>RSI (14)</span>
          <div ref={rsiRef} style={{ width: '100%', height: '100%' }} />
        </div>
      )}

      {/* ── MACD pane ── */}
      {showMACD && (
        <div style={{ flexShrink: 0, height: 120, borderTop: `1px solid ${T.border}`, position: 'relative' }}>
          <span style={{ position: 'absolute', top: 4, left: 8, fontSize: 9, color: T.cyan, fontFamily: "'IBM Plex Mono', monospace", zIndex: 1, pointerEvents: 'none' }}>MACD (12, 26, 9)</span>
          <div ref={macdRef} style={{ width: '100%', height: '100%' }} />
        </div>
      )}
    </div>
  );
}
