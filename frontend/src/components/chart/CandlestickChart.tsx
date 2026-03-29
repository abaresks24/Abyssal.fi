'use client';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Candle } from '@/types';
import { sma, ema, bollingerBands, rsi, macd, toLWCSeries } from '@/lib/indicators';

// ── Theme ─────────────────────────────────────────────────────────────────────
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
  toolbar:   '#0c1620',
};

// ── Indicators ────────────────────────────────────────────────────────────────
const IND_DEFS = [
  { id: 'ma7',   label: 'MA 7',   color: '#f0b90b' },
  { id: 'ma25',  label: 'MA 25',  color: '#e91e63' },
  { id: 'ma99',  label: 'MA 99',  color: '#2196f3' },
  { id: 'ema12', label: 'EMA 12', color: '#9c27b0' },
  { id: 'ema26', label: 'EMA 26', color: '#ff9800' },
  { id: 'bb',    label: 'BB',     color: '#55c3e9' },
  { id: 'vol',   label: 'Vol',    color: '#526a82' },
  { id: 'rsi',   label: 'RSI',    color: '#55c3e9' },
  { id: 'macd',  label: 'MACD',   color: '#02c77b' },
] as const;
type IndicatorId = (typeof IND_DEFS)[number]['id'];

// ── Drawing tools ─────────────────────────────────────────────────────────────
type DrawTool = 'cursor' | 'line' | 'hline' | 'vline' | 'rect' | 'text';
interface DrawPoint { price: number; time: number; }
interface Drawing { id: string; tool: DrawTool; points: DrawPoint[]; color: string; }

// ── SVG toolbar icons ────────────────────────────────────────────────────────
const Icons = {
  cursor:   <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4}><path d="M3 2l10 6-5 1-2 5z"/></svg>,
  trendUp:  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4}><line x1="2" y1="12" x2="14" y2="4"/><polyline points="9,4 14,4 14,9"/></svg>,
  hline:    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4}><line x1="2" y1="8" x2="14" y2="8"/><circle cx="2" cy="8" r="1.2" fill="currentColor"/><circle cx="14" cy="8" r="1.2" fill="currentColor"/></svg>,
  vline:    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4}><line x1="8" y1="2" x2="8" y2="14"/></svg>,
  hlines:   <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4}><line x1="2" y1="5" x2="14" y2="5"/><line x1="2" y1="8" x2="14" y2="8"/><line x1="2" y1="11" x2="14" y2="11"/></svg>,
  polyline: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4}><polyline points="2,12 5,6 9,9 14,4"/><circle cx="2" cy="12" r="1.5" fill="currentColor"/><circle cx="5" cy="6" r="1.5" fill="currentColor"/><circle cx="9" cy="9" r="1.5" fill="currentColor"/><circle cx="14" cy="4" r="1.5" fill="currentColor"/></svg>,
  measure:  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4}><line x1="2" y1="8" x2="14" y2="8" strokeDasharray="3,2"/><line x1="2" y1="5" x2="2" y2="11"/><line x1="14" y1="5" x2="14" y2="11"/></svg>,
  pencil:   <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4}><path d="M11 2l3 3-8 8H3v-3z"/><line x1="9" y1="4" x2="12" y2="7"/></svg>,
  text:     <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4}><line x1="3" y1="4" x2="13" y2="4"/><line x1="8" y1="4" x2="8" y2="13"/></svg>,
  emoji:    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4}><circle cx="8" cy="8" r="5.5"/><circle cx="6" cy="7" r="0.7" fill="currentColor"/><circle cx="10" cy="7" r="0.7" fill="currentColor"/><path d="M5.5 10c.7 1 4.3 1 5 0"/></svg>,
  ruler:    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4}><rect x="2" y="6" width="12" height="4" rx="0.5"/><line x1="5" y1="6" x2="5" y2="8"/><line x1="8" y1="6" x2="8" y2="9"/><line x1="11" y1="6" x2="11" y2="8"/></svg>,
  zoomin:   <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4}><circle cx="7" cy="7" r="4.5"/><line x1="10.5" y1="10.5" x2="14" y2="14"/><line x1="7" y1="5" x2="7" y2="9"/><line x1="5" y1="7" x2="9" y2="7"/></svg>,
  magnet:   <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4}><path d="M4 3h2v6a2 2 0 004 0V3h2v6a4 4 0 01-8 0z"/><line x1="4" y1="3" x2="6" y2="3"/><line x1="10" y1="3" x2="12" y2="3"/></svg>,
  lock:     <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4}><rect x="3.5" y="7" width="9" height="7" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2"/></svg>,
  reset:    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4}><path d="M3 8a5 5 0 105-5H5"/><polyline points="2,5 5,5 5,8"/></svg>,
  trash:    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4}><polyline points="3,5 13,5"/><path d="M5 5V4a1 1 0 011-1h4a1 1 0 011 1v1"/><rect x="4" y="5" width="8" height="8" rx="1"/><line x1="7" y1="8" x2="7" y2="11"/><line x1="9" y1="8" x2="9" y2="11"/></svg>,
  rect:     <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4}><rect x="3" y="4" width="10" height="8" rx="0.5"/></svg>,
};

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  candles:        Candle[];
  currentPrice:   number;
  selectedStrike: number | null;
  intervalMs:     number;
  onLoadMore?:    () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function CandlestickChart({ candles, currentPrice, selectedStrike, onLoadMore }: Props) {
  // DOM refs
  const mainRef  = useRef<HTMLDivElement>(null);
  const rsiRef   = useRef<HTMLDivElement>(null);
  const macdRef  = useRef<HTMLDivElement>(null);

  // Chart/series refs (all any — LWC types not statically imported)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartMain   = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRsi    = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartMacd   = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const series      = useRef<Record<string, any>>({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lwc         = useRef<any>(null);    // cached LWC module

  // Price-line refs — ONE of each, managed entirely by hand
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const curLine    = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const strikeLine = useRef<any>(null);

  // "Prop mirror" refs — always reflect the latest prop without causing re-renders
  const onLoadMoreRef     = useRef(onLoadMore);
  const selectedStrikeRef = useRef(selectedStrike);
  const candlesRef        = useRef(candles);
  const currentPriceRef   = useRef(currentPrice);
  onLoadMoreRef.current     = onLoadMore;
  selectedStrikeRef.current = selectedStrike;
  candlesRef.current        = candles;
  currentPriceRef.current   = currentPrice;

  // Tracks first candle's timestamp to detect live ticks vs full reloads
  const firstCandleTsRef = useRef<number>(0);

  // State
  const [active,     setActive]     = useState<Set<IndicatorId>>(new Set([]));
  const [drawTool,   setDrawTool]   = useState<DrawTool>('cursor');
  const [drawings,   setDrawings]   = useState<Drawing[]>([]);
  const [draftDraw,  setDraftDraw]  = useState<Drawing | null>(null);
  const [renderTick, setRenderTick] = useState(0);
  // Incremented after main chart is fully initialised — gates subsequent effects
  const [chartReady, setChartReady] = useState(0);

  const loadCooldown = useRef(false);
  const isDrawing    = useRef(false);
  const drawStart    = useRef<DrawPoint | null>(null);

  const showRSI  = active.has('rsi');
  const showMACD = active.has('macd');

  const toggleIndicator = useCallback((id: IndicatorId) => {
    setActive(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);

  // ── Coordinate helpers ────────────────────────────────────────────────────
  const toPixel = useCallback((price: number, time: number) => {
    const c = chartMain.current;
    const s = series.current.candle;
    if (!c || !s) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const x = c.timeScale().timeToCoordinate(time as any);
    const y = s.priceToCoordinate(price);
    if (x == null || y == null) return null;
    return { x: x as number, y: y as number };
  }, []);

  const fromPixel = useCallback((x: number, y: number): DrawPoint | null => {
    const c = chartMain.current;
    const s = series.current.candle;
    if (!c || !s) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const time  = c.timeScale().coordinateToTime(x) as any as number;
    const price = s.coordinateToPrice(y) as number | null;
    if (time == null || price == null) return null;
    return { price, time };
  }, []);

  // ── Helpers for safe price-line management (v4 API) ───────────────────────
  const createCurLine = useCallback(() => {
    const s = series.current.candle;
    if (!s || currentPriceRef.current <= 0) return;
    if (curLine.current) return;   // never create a second line — safety guard
    try {
      curLine.current = s.createPriceLine({
        price: currentPriceRef.current,
        color: T.cyan, lineWidth: 1, lineStyle: 2,
        axisLabelVisible: true, title: '',
      });
    } catch { /* */ }
  }, []);

  // v4 uses series.removePriceLine(line) — NOT line.remove()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const removePriceLine = useCallback((line: any) => {
    const s = series.current.candle;
    if (!s || !line) return;
    try { s.removePriceLine(line); } catch { /* */ }
  }, []);

  // ── 1. MAIN CHART INIT (runs once on mount) ───────────────────────────────
  const disposeMain = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!mainRef.current) return;
    let destroyed = false;

    (async () => {
      const LWC = await import('lightweight-charts');
      if (destroyed || !mainRef.current) return;

      lwc.current = LWC;
      const { createChart, CrosshairMode, LineStyle } = LWC;

      const baseOpts = {
        layout: {
          background: { color: T.bg },
          textColor: T.axis,
          fontFamily: "'IBM Plex Mono',monospace",
          fontSize: 11,
        },
        grid:      { vertLines: { color: T.grid }, horzLines: { color: T.grid } },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: T.crosshair, width: 1 as const, style: LineStyle.Dashed, labelBackgroundColor: T.xhairBg },
          horzLine: { color: T.crosshair, width: 1 as const, style: LineStyle.Dashed, labelBackgroundColor: T.xhairBg },
        },
        rightPriceScale: { borderColor: T.border },
        timeScale:       { borderColor: T.border, timeVisible: true, secondsVisible: false },
        handleScroll:    { mouseWheel: true, pressedMouseMove: true },
        handleScale:     { mouseWheel: true, pinch: true },
      };

      const el = mainRef.current;
      const main = createChart(el, {
        ...baseOpts,
        width:  el.clientWidth  || el.offsetWidth  || 800,
        height: el.clientHeight || el.offsetHeight || 500,
      });
      chartMain.current = main;

      // Candle series — NO auto label/line; we manage ONE price line manually
      series.current.candle = main.addCandlestickSeries({
        upColor:        T.up,   downColor:        T.down,
        borderUpColor:  T.up,   borderDownColor:  T.down,
        wickUpColor:    T.up,   wickDownColor:    T.down,
        lastValueVisible: false,   // never renders auto label on right axis
        priceLineVisible: false,   // never draws auto dashed line
      });

      // Load-more trigger
      main.timeScale().subscribeVisibleLogicalRangeChange((range: unknown) => {
        const r = range as { from: number; to: number } | null;
        if (r && r.from < 5 && !loadCooldown.current && onLoadMoreRef.current) {
          loadCooldown.current = true;
          onLoadMoreRef.current();
          setTimeout(() => { loadCooldown.current = false; }, 2000);
        }
        if (!destroyed) setRenderTick(t => t + 1);
      });

      // Resize observer
      const ro = new ResizeObserver(() => {
        if (!mainRef.current || !chartMain.current) return;
        chartMain.current.applyOptions({
          width:  mainRef.current.clientWidth,
          height: mainRef.current.clientHeight,
        });
        if (rsiRef.current  && chartRsi.current)  chartRsi.current.applyOptions({ width: rsiRef.current.clientWidth, height: rsiRef.current.clientHeight });
        if (macdRef.current && chartMacd.current) chartMacd.current.applyOptions({ width: macdRef.current.clientWidth, height: macdRef.current.clientHeight });
        if (!destroyed) setRenderTick(t => t + 1);
      });
      ro.observe(el);

      disposeMain.current = () => {
        ro.disconnect();
        curLine.current    = null;
        strikeLine.current = null;
        firstCandleTsRef.current = 0;
        chartMain.current?.remove();
        chartRsi.current?.remove();
        chartMacd.current?.remove();
        chartMain.current = null;
        chartRsi.current  = null;
        chartMacd.current = null;
        series.current    = {};
        disposeMain.current = null;
      };

      if (!destroyed) setChartReady(k => k + 1);
    })();

    return () => {
      destroyed = true;
      disposeMain.current?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 2. FEED CANDLE DATA ───────────────────────────────────────────────────
  useEffect(() => {
    const s = series.current;
    if (!s.candle || candles.length === 0) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ts = (c: Candle): any => Math.floor(c.timestamp / 1000);
    const firstTs = candles[0].timestamp;
    const last    = candles[candles.length - 1];

    if (firstTs === firstCandleTsRef.current) {
      // ── Live tick: series.update() — does NOT destroy price lines ──
      s.candle.update({ time: ts(last), open: last.open, high: last.high, low: last.low, close: last.close });
      if (s.vol) s.vol.update({
        time: ts(last), value: last.volume,
        color: last.close >= last.open ? 'rgba(2,199,123,0.35)' : 'rgba(235,54,90,0.35)',
      });
      return;
    }

    // ── Full reload: setData() DESTROYS all createPriceLine lines ──
    firstCandleTsRef.current = firstTs;
    const closes = candles.map(c => c.close);

    s.candle.setData(candles.map(c => ({ time: ts(c), open: c.open, high: c.high, low: c.low, close: c.close })));

    if (s.vol) s.vol.setData(candles.map(c => ({
      time: ts(c), value: c.volume,
      color: c.close >= c.open ? 'rgba(2,199,123,0.35)' : 'rgba(235,54,90,0.35)',
    })));

    const maData = (p: number) => toLWCSeries(candles, sma(closes, p));
    const emData = (p: number) => toLWCSeries(candles, ema(closes, p));
    if (s.ma7)   s.ma7.setData(maData(7));
    if (s.ma25)  s.ma25.setData(maData(25));
    if (s.ma99)  s.ma99.setData(maData(99));
    if (s.ema12) s.ema12.setData(emData(12));
    if (s.ema26) s.ema26.setData(emData(26));

    if (s.bbUpper || s.bbMid || s.bbLower) {
      const bb = bollingerBands(closes);
      s.bbUpper?.setData(toLWCSeries(candles, bb.map(b => b.upper)));
      s.bbMid?.setData(toLWCSeries(candles,   bb.map(b => b.mid)));
      s.bbLower?.setData(toLWCSeries(candles,  bb.map(b => b.lower)));
    }

    if (s.rsiLine) {
      s.rsiLine.setData(toLWCSeries(candles, rsi(closes)));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const flat = (v: number) => candles.map(c => ({ time: ts(c), value: v })) as any[];
      s.rsi70?.setData(flat(70));
      s.rsi30?.setData(flat(30));
    }

    if (s.macdLine) {
      const { macdLine: ml, signalLine: sl, hist: hl } = macd(closes);
      s.macdLine.setData(toLWCSeries(candles, ml));
      s.macdSig.setData(toLWCSeries(candles, sl));
      s.macdHist.setData(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        candles.map((c, i) => ({ time: ts(c), value: hl[i] ?? 0, color: (hl[i] ?? 0) >= 0 ? T.up : T.down } as any))
               .filter((d: { value: number }) => d.value !== 0),
      );
    }

    // After setData, recreate price lines (they were destroyed)
    curLine.current    = null;
    strikeLine.current = null;

    if (currentPriceRef.current > 0) {
      createCurLine();
    }
    const sk = selectedStrikeRef.current;
    if (sk && sk > 0) {
      try {
        strikeLine.current = s.candle.createPriceLine({
          price: sk, color: T.amber, lineWidth: 1,
          lineStyle: 2, axisLabelVisible: true, title: `K ${sk.toLocaleString()}`,
        });
      } catch { /* */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, chartReady]);

  // ── 3. CURRENT PRICE LINE ─────────────────────────────────────────────────
  // Only ever calls applyOptions on the existing line — never creates a new one here
  // (line is created/recreated in the candle data effect after setData)
  useEffect(() => {
    if (currentPrice <= 0) return;
    if (curLine.current) {
      try { curLine.current.applyOptions({ price: currentPrice }); } catch { /* */ }
    } else if (series.current.candle) {
      // Chart ready but data not loaded yet, or line lost — create it
      createCurLine();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPrice]);

  // ── 4. STRIKE PRICE LINE ──────────────────────────────────────────────────
  useEffect(() => {
    const s = series.current.candle;
    if (!s) return;
    if (selectedStrike && selectedStrike > 0) {
      if (strikeLine.current) {
        try { strikeLine.current.applyOptions({ price: selectedStrike, title: `K ${selectedStrike.toLocaleString()}` }); } catch { /* */ }
      } else {
        try {
          strikeLine.current = s.createPriceLine({
            price: selectedStrike, color: T.amber, lineWidth: 1,
            lineStyle: 2, axisLabelVisible: true, title: `K ${selectedStrike.toLocaleString()}`,
          });
        } catch { /* */ }
      }
    } else if (strikeLine.current) {
      removePriceLine(strikeLine.current);
      strikeLine.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStrike, chartReady]);

  // ── 5. OVERLAY INDICATORS TOGGLE ─────────────────────────────────────────
  useEffect(() => {
    const chart = chartMain.current;
    if (!chart) return;

    // Helper: add a line series if not yet present
    const addLine = (key: string, color: string) => {
      if (!series.current[key]) {
        series.current[key] = chart.addLineSeries({
          color, lineWidth: 1 as const,
          priceLineVisible: false, lastValueVisible: false,
        });
        // Feed existing data immediately
        const cands = candlesRef.current;
        if (cands.length > 0) {
          const closes = cands.map(c => c.close);
          const tsv = (c: Candle) => Math.floor(c.timestamp / 1000);
          if (key === 'ma7')   series.current[key].setData(toLWCSeries(cands, sma(closes, 7)));
          if (key === 'ma25')  series.current[key].setData(toLWCSeries(cands, sma(closes, 25)));
          if (key === 'ma99')  series.current[key].setData(toLWCSeries(cands, sma(closes, 99)));
          if (key === 'ema12') series.current[key].setData(toLWCSeries(cands, ema(closes, 12)));
          if (key === 'ema26') series.current[key].setData(toLWCSeries(cands, ema(closes, 26)));
          if (key.startsWith('bb')) {
            const bb = bollingerBands(closes);
            if (key === 'bbUpper') series.current[key].setData(toLWCSeries(cands, bb.map(b => b.upper)));
            if (key === 'bbMid')   series.current[key].setData(toLWCSeries(cands, bb.map(b => b.mid)));
            if (key === 'bbLower') series.current[key].setData(toLWCSeries(cands, bb.map(b => b.lower)));
          }
          if (key === 'vol') {
            series.current[key].setData(cands.map(c => ({
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              time: tsv(c) as any, value: c.volume,
              color: c.close >= c.open ? 'rgba(2,199,123,0.35)' : 'rgba(235,54,90,0.35)',
            })));
          }
        }
      }
    };

    const drop = (key: string) => {
      if (series.current[key]) {
        try { chart.removeSeries(series.current[key]); } catch { /* */ }
        delete series.current[key];
      }
    };

    if (active.has('ma7'))   addLine('ma7',   '#f0b90b'); else drop('ma7');
    if (active.has('ma25'))  addLine('ma25',  '#e91e63'); else drop('ma25');
    if (active.has('ma99'))  addLine('ma99',  '#2196f3'); else drop('ma99');
    if (active.has('ema12')) addLine('ema12', '#9c27b0'); else drop('ema12');
    if (active.has('ema26')) addLine('ema26', '#ff9800'); else drop('ema26');

    if (active.has('bb')) {
      addLine('bbUpper', 'rgba(85,195,233,0.7)');
      addLine('bbMid',   'rgba(85,195,233,0.4)');
      addLine('bbLower', 'rgba(85,195,233,0.7)');
    } else { drop('bbUpper'); drop('bbMid'); drop('bbLower'); }

    if (active.has('vol')) {
      if (!series.current.vol) {
        series.current.vol = chart.addHistogramSeries({
          priceFormat: { type: 'volume' },
          priceScaleId: 'vol',
          lastValueVisible: false,
          priceLineVisible: false,
        });
        chart.priceScale('vol').applyOptions({
          scaleMargins: { top: 0.8, bottom: 0 },
          visible: false,
        });
        // Feed vol data immediately
        const cands = candlesRef.current;
        if (cands.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const tsv = (c: Candle): any => Math.floor(c.timestamp / 1000);
          series.current.vol.setData(cands.map((c: Candle) => ({
            time: tsv(c), value: c.volume,
            color: c.close >= c.open ? 'rgba(2,199,123,0.35)' : 'rgba(235,54,90,0.35)',
          })));
        }
      }
    } else { drop('vol'); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, chartReady]);

  // ── 6. RSI SUB-CHART ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!showRSI) {
      // Tear down RSI chart
      chartRsi.current?.remove();
      chartRsi.current = null;
      delete series.current.rsiLine;
      delete series.current.rsi70;
      delete series.current.rsi30;
      return;
    }
    if (!chartMain.current || !rsiRef.current || !lwc.current) return;

    const { createChart, LineStyle } = lwc.current;
    const main = chartMain.current;
    const el   = rsiRef.current;

    const rc = createChart(el, {
      layout: {
        background: { color: T.bg },
        textColor: T.axis,
        fontFamily: "'IBM Plex Mono',monospace",
        fontSize: 10,
      },
      grid:            { vertLines: { color: T.grid }, horzLines: { color: T.grid } },
      crosshair:       { vertLine: { color: T.crosshair, width: 1 as const, style: LineStyle.Dashed, labelBackgroundColor: T.xhairBg }, horzLine: { color: T.crosshair, width: 1 as const, style: LineStyle.Dashed, labelBackgroundColor: T.xhairBg } },
      rightPriceScale: { borderColor: T.border, scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale:       { borderColor: T.border, visible: false },
      width:  el.clientWidth  || el.offsetWidth  || 800,
      height: el.clientHeight || el.offsetHeight || 120,
    });
    chartRsi.current = rc;

    series.current.rsiLine = rc.addLineSeries({ color: T.cyan,                 lineWidth: 1 as const, lastValueVisible: false, priceLineVisible: false });
    series.current.rsi70   = rc.addLineSeries({ color: 'rgba(235,54,90,0.45)', lineWidth: 1 as const, lineStyle: LineStyle.Dashed, lastValueVisible: false, priceLineVisible: false });
    series.current.rsi30   = rc.addLineSeries({ color: 'rgba(2,199,123,0.45)', lineWidth: 1 as const, lineStyle: LineStyle.Dashed, lastValueVisible: false, priceLineVisible: false });

    // Feed existing candles
    const cands = candlesRef.current;
    if (cands.length > 0) {
      const closes = cands.map(c => c.close);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tsv = (c: Candle): any => Math.floor(c.timestamp / 1000);
      series.current.rsiLine.setData(toLWCSeries(cands, rsi(closes)));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const flat = (v: number) => cands.map(c => ({ time: tsv(c), value: v })) as any[];
      series.current.rsi70.setData(flat(70));
      series.current.rsi30.setData(flat(30));
    }

    // Sync timescales — v4 API: subscribe/unsubscribeVisibleTimeRangeChange
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onMainRange = (r: any) => { if (r) { try { rc.timeScale().setVisibleRange(r); } catch { /* */ } } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onRsiRange  = (r: any) => { if (r) { try { main.timeScale().setVisibleRange(r); } catch { /* */ } } };
    main.timeScale().subscribeVisibleTimeRangeChange(onMainRange);
    rc.timeScale().subscribeVisibleTimeRangeChange(onRsiRange);

    return () => {
      try { main.timeScale().unsubscribeVisibleTimeRangeChange(onMainRange); } catch { /* */ }
      try { rc.timeScale().unsubscribeVisibleTimeRangeChange(onRsiRange); } catch { /* */ }
      rc.remove();
      chartRsi.current = null;
      delete series.current.rsiLine;
      delete series.current.rsi70;
      delete series.current.rsi30;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRSI, chartReady]);

  // ── 7. MACD SUB-CHART ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!showMACD) {
      chartMacd.current?.remove();
      chartMacd.current = null;
      delete series.current.macdLine;
      delete series.current.macdSig;
      delete series.current.macdHist;
      return;
    }
    if (!chartMain.current || !macdRef.current || !lwc.current) return;

    const { createChart, LineStyle } = lwc.current;
    const main = chartMain.current;
    const el   = macdRef.current;

    const mc = createChart(el, {
      layout: {
        background: { color: T.bg },
        textColor: T.axis,
        fontFamily: "'IBM Plex Mono',monospace",
        fontSize: 10,
      },
      grid:            { vertLines: { color: T.grid }, horzLines: { color: T.grid } },
      crosshair:       { vertLine: { color: T.crosshair, width: 1 as const, style: LineStyle.Dashed, labelBackgroundColor: T.xhairBg }, horzLine: { color: T.crosshair, width: 1 as const, style: LineStyle.Dashed, labelBackgroundColor: T.xhairBg } },
      rightPriceScale: { borderColor: T.border, scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale:       { borderColor: T.border, visible: true },
      width:  el.clientWidth  || el.offsetWidth  || 800,
      height: el.clientHeight || el.offsetHeight || 120,
    });
    chartMacd.current = mc;

    series.current.macdLine = mc.addLineSeries({ color: T.cyan,    lineWidth: 1 as const, lastValueVisible: false, priceLineVisible: false });
    series.current.macdSig  = mc.addLineSeries({ color: '#ff9800', lineWidth: 1 as const, lastValueVisible: false, priceLineVisible: false });
    series.current.macdHist = mc.addHistogramSeries({ color: T.up, lastValueVisible: false, priceLineVisible: false });

    // Feed existing candles
    const cands = candlesRef.current;
    if (cands.length > 0) {
      const closes = cands.map(c => c.close);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tsv = (c: Candle): any => Math.floor(c.timestamp / 1000);
      const { macdLine: ml, signalLine: sl, hist: hl } = macd(closes);
      series.current.macdLine.setData(toLWCSeries(cands, ml));
      series.current.macdSig.setData(toLWCSeries(cands, sl));
      series.current.macdHist.setData(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cands.map((c, i) => ({ time: tsv(c), value: hl[i] ?? 0, color: (hl[i] ?? 0) >= 0 ? T.up : T.down } as any))
             .filter((d: { value: number }) => d.value !== 0),
      );
    }

    // Sync timescales — v4 API
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onMainRange = (r: any) => { if (r) { try { mc.timeScale().setVisibleRange(r); } catch { /* */ } } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onMacdRange = (r: any) => { if (r) { try { main.timeScale().setVisibleRange(r); } catch { /* */ } } };
    main.timeScale().subscribeVisibleTimeRangeChange(onMainRange);
    mc.timeScale().subscribeVisibleTimeRangeChange(onMacdRange);

    return () => {
      try { main.timeScale().unsubscribeVisibleTimeRangeChange(onMainRange); } catch { /* */ }
      try { mc.timeScale().unsubscribeVisibleTimeRangeChange(onMacdRange); } catch { /* */ }
      mc.remove();
      chartMacd.current = null;
      delete series.current.macdLine;
      delete series.current.macdSig;
      delete series.current.macdHist;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMACD, chartReady]);

  // ── 8. DRAWING HANDLERS ───────────────────────────────────────────────────
  const relPos = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const el = mainRef.current; if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }, []);

  const onDrawDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (drawTool === 'cursor') return;
    const pos = relPos(e); if (!pos) return;
    const pt = fromPixel(pos.x, pos.y); if (!pt) return;
    if (drawTool === 'hline' || drawTool === 'vline') {
      setDrawings(prev => [...prev, { id: Date.now().toString(), tool: drawTool, points: [pt], color: T.cyan }]);
      return;
    }
    isDrawing.current = true; drawStart.current = pt;
    setDraftDraw({ id: 'draft', tool: drawTool, points: [pt, pt], color: T.cyan });
  }, [drawTool, fromPixel, relPos]);

  const onDrawMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDrawing.current || !drawStart.current) return;
    const pos = relPos(e); if (!pos) return;
    const pt = fromPixel(pos.x, pos.y); if (!pt) return;
    setDraftDraw(prev => prev ? { ...prev, points: [drawStart.current!, pt] } : null);
  }, [fromPixel, relPos]);

  const onDrawUp = useCallback(() => {
    if (!isDrawing.current || !draftDraw) return;
    isDrawing.current = false; drawStart.current = null;
    if (draftDraw.points.length >= 2) setDrawings(prev => [...prev, { ...draftDraw, id: Date.now().toString() }]);
    setDraftDraw(null);
  }, [draftDraw]);

  // ── SVG drawing elements ──────────────────────────────────────────────────
  const svgEl = (d: Drawing): React.ReactNode => {
    const W = mainRef.current?.clientWidth ?? 0;
    const H = mainRef.current?.clientHeight ?? 0;
    switch (d.tool) {
      case 'hline': {
        const c = toPixel(d.points[0].price, d.points[0].time); if (!c) return null;
        return (
          <g key={d.id}>
            <line x1={0} y1={c.y} x2={W} y2={c.y} stroke={d.color} strokeWidth={1} strokeDasharray="5,3"/>
            <text x={6} y={c.y - 4} fill={d.color} fontSize={10} fontFamily="'IBM Plex Mono',monospace">{d.points[0].price.toFixed(2)}</text>
          </g>
        );
      }
      case 'vline': {
        const c = toPixel(d.points[0].price, d.points[0].time); if (!c) return null;
        return <line key={d.id} x1={c.x} y1={0} x2={c.x} y2={H} stroke={d.color} strokeWidth={1} strokeDasharray="5,3"/>;
      }
      case 'line': {
        if (d.points.length < 2) return null;
        const c0 = toPixel(d.points[0].price, d.points[0].time);
        const c1 = toPixel(d.points[1].price, d.points[1].time);
        if (!c0 || !c1) return null;
        return <line key={d.id} x1={c0.x} y1={c0.y} x2={c1.x} y2={c1.y} stroke={d.color} strokeWidth={1.5}/>;
      }
      case 'rect': {
        if (d.points.length < 2) return null;
        const c0 = toPixel(d.points[0].price, d.points[0].time);
        const c1 = toPixel(d.points[1].price, d.points[1].time);
        if (!c0 || !c1) return null;
        return <rect key={d.id} x={Math.min(c0.x,c1.x)} y={Math.min(c0.y,c1.y)} width={Math.abs(c1.x-c0.x)} height={Math.abs(c1.y-c0.y)} stroke={d.color} strokeWidth={1} fill={`${d.color}18`}/>;
      }
      default: return null;
    }
  };

  // ── Toolbar definition ────────────────────────────────────────────────────
  type BtnDef = { id: DrawTool | '_clear'; icon: React.ReactNode; label: string; };
  const toolbarSections: BtnDef[][] = [
    [{ id: 'cursor', icon: Icons.cursor,   label: 'Cursor' }],
    [
      { id: 'line',   icon: Icons.trendUp,  label: 'Trend Line' },
      { id: 'hline',  icon: Icons.hline,    label: 'Horizontal Line' },
      { id: 'vline',  icon: Icons.vline,    label: 'Vertical Line' },
      { id: 'rect',   icon: Icons.rect,     label: 'Rectangle' },
      { id: 'cursor', icon: Icons.polyline, label: 'Polyline' },
    ],
    [
      { id: 'cursor', icon: Icons.hlines,   label: 'H-Lines' },
      { id: 'cursor', icon: Icons.measure,  label: 'Measure' },
      { id: 'cursor', icon: Icons.pencil,   label: 'Freehand' },
      { id: 'text',   icon: Icons.text,     label: 'Text' },
      { id: 'cursor', icon: Icons.emoji,    label: 'Emoji' },
    ],
    [
      { id: 'cursor', icon: Icons.ruler,    label: 'Ruler' },
      { id: 'cursor', icon: Icons.zoomin,   label: 'Zoom In' },
    ],
    [
      { id: 'cursor', icon: Icons.magnet,   label: 'Snap' },
      { id: 'cursor', icon: Icons.lock,     label: 'Lock' },
      { id: '_clear', icon: Icons.reset,    label: 'Clear All' },
      { id: '_clear', icon: Icons.trash,    label: 'Trash' },
    ],
  ];

  const allDrawings = [...drawings, ...(draftDraw ? [draftDraw] : [])];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: T.bg }}>

      {/* Indicator buttons */}
      <div style={{
        display: 'flex', gap: 4, padding: '4px 8px', flexShrink: 0,
        borderBottom: `1px solid ${T.border}`, flexWrap: 'wrap', background: T.toolbar,
      }}>
        {IND_DEFS.map(({ id, label, color }) => {
          const on = active.has(id);
          return (
            <button key={id} onClick={() => toggleIndicator(id)} style={{
              padding: '2px 8px', fontSize: 10, borderRadius: 3, cursor: 'pointer',
              fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.04em',
              background: on ? `${color}22` : 'transparent',
              color:      on ? color : T.axis,
              border:     `1px solid ${on ? color : 'rgba(255,255,255,0.08)'}`,
              transition: 'all 0.1s',
            }}>
              {label}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* Left drawing toolbar */}
        <div style={{
          width: 38, flexShrink: 0, background: T.toolbar,
          borderRight: `1px solid ${T.border}`,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          paddingTop: 4,
        }}>
          {toolbarSections.map((section, si) => (
            <React.Fragment key={si}>
              {si > 0 && <div style={{ width: 22, height: 1, background: T.border, margin: '3px 0' }} />}
              {section.map((btn, bi) => {
                const isClear  = btn.id === '_clear';
                const isActive = !isClear && btn.id === drawTool;
                return (
                  <button
                    key={`${si}-${bi}`}
                    title={btn.label}
                    onClick={() => {
                      if (isClear) { setDrawings([]); setDraftDraw(null); }
                      else setDrawTool(btn.id as DrawTool);
                    }}
                    style={{
                      width: 30, height: 28, padding: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: 4, cursor: 'pointer', border: 'none', margin: '1px 0',
                      background: isActive ? 'rgba(85,195,233,0.18)' : 'transparent',
                      color:      isActive ? T.cyan : isClear ? 'rgba(82,106,130,0.6)' : T.axis,
                    }}
                  >
                    <div style={{ width: 16, height: 16 }}>{btn.icon}</div>
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </div>

        {/* Chart column */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

          {/* Main chart */}
          <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            <div ref={mainRef} style={{ width: '100%', height: '100%' }} />
            <svg
              style={{
                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                pointerEvents: drawTool === 'cursor' ? 'none' : 'all',
                cursor: drawTool !== 'cursor' ? 'crosshair' : 'default',
              }}
              data-tick={renderTick}
              onMouseDown={onDrawDown}
              onMouseMove={onDrawMove}
              onMouseUp={onDrawUp}
            >
              {allDrawings.map(svgEl)}
            </svg>
          </div>

          {/* RSI sub-chart */}
          {showRSI && (
            <div style={{ flexShrink: 0, height: 120, borderTop: `1px solid ${T.border}`, position: 'relative' }}>
              <span style={{ position: 'absolute', top: 4, left: 8, fontSize: 9, color: T.cyan, fontFamily: "'IBM Plex Mono',monospace", zIndex: 1, pointerEvents: 'none' }}>RSI (14)</span>
              <div ref={rsiRef} style={{ width: '100%', height: '100%' }} />
            </div>
          )}

          {/* MACD sub-chart */}
          {showMACD && (
            <div style={{ flexShrink: 0, height: 120, borderTop: `1px solid ${T.border}`, position: 'relative' }}>
              <span style={{ position: 'absolute', top: 4, left: 8, fontSize: 9, color: T.cyan, fontFamily: "'IBM Plex Mono',monospace", zIndex: 1, pointerEvents: 'none' }}>MACD (12, 26, 9)</span>
              <div ref={macdRef} style={{ width: '100%', height: '100%' }} />
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
