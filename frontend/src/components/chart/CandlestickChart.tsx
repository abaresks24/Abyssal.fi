'use client';
/**
 * CandlestickChart — powered by TradingView lightweight-charts v5
 * Drawing tools (trend lines, horizontal lines) via the v5 primitives API.
 * Navigation: scroll + pinch + mouse-wheel zoom, all native.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickSeriesPartialOptions,
  type ISeriesPrimitive,
  type IPrimitivePaneView,
  type IPrimitivePaneRenderer,
  type SeriesAttachedParameter,
  type Time,
  type Coordinate,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type { Candle } from '@/types';

// ── Types ────────────────────────────────────────────────────────────────────

type DrawTool = 'cursor' | 'trendline' | 'hline' | 'ray' | 'erase';

interface TLPoint { time: Time; price: number; }
interface TLEntry  { id: number; p1: TLPoint; p2: TLPoint; color: string; }

// ── Trend-line renderer ───────────────────────────────────────────────────────

class TrendLineRenderer implements IPrimitivePaneRenderer {
  constructor(
    private _lines:  TLEntry[],
    private _chart:  IChartApi,
    private _series: ISeriesApi<'Candlestick'>,
    private _preview: { p1: TLPoint; p2: TLPoint | null } | null,
  ) {}

  draw(target: CanvasRenderingTarget2D): void {
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      const drawLine = (
        p1: TLPoint,
        p2: TLPoint,
        color: string,
        dashed = false,
        extend = false,
      ) => {
        const x1: Coordinate | null = this._chart.timeScale().timeToCoordinate(p1.time);
        const y1: Coordinate | null = this._series.priceToCoordinate(p1.price);
        const x2: Coordinate | null = this._chart.timeScale().timeToCoordinate(p2.time);
        const y2: Coordinate | null = this._series.priceToCoordinate(p2.price);
        if (x1 === null || y1 === null || x2 === null || y2 === null) return;

        ctx.save();
        ctx.beginPath();
        if (dashed) ctx.setLineDash([4, 4]);

        let sx = x1 as number, sy = y1 as number, ex = x2 as number, ey = y2 as number;
        if (extend) {
          // Extend ray to the right edge of the visible pane
          const pane = (this._chart as unknown as { options: () => { width: number } }).options();
          const w = pane?.width ?? 2000;
          const dx = ex - sx, dy = ey - sy;
          if (Math.abs(dx) > 0.001) {
            const t = (w - sx) / dx;
            ex = w; ey = sy + t * dy;
          }
        }

        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Endpoint dot
        ctx.beginPath();
        ctx.arc(+sx, +sy, 3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        if (!extend) {
          ctx.beginPath();
          ctx.arc(+ex, +ey, 3, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        }
      };

      for (const l of this._lines) {
        const isRay = (l as TLEntry & { ray?: boolean }).ray;
        drawLine(l.p1, l.p2, l.color, false, !!isRay);
      }

      if (this._preview?.p2) {
        drawLine(this._preview.p1, this._preview.p2, 'rgba(85,195,233,0.6)', true);
      }
    });
  }
}

// ── Trend-line pane view ──────────────────────────────────────────────────────

class TrendLinePaneView implements IPrimitivePaneView {
  constructor(
    private _lines:   TLEntry[],
    private _chart:   IChartApi,
    private _series:  ISeriesApi<'Candlestick'>,
    private _preview: { p1: TLPoint; p2: TLPoint | null } | null,
  ) {}

  zOrder(): 'top' { return 'top'; }

  renderer(): IPrimitivePaneRenderer {
    return new TrendLineRenderer(this._lines, this._chart, this._series, this._preview);
  }
}

// ── Trend-line primitive ──────────────────────────────────────────────────────

class TrendLinePrimitive implements ISeriesPrimitive<Time> {
  private _lines:   TLEntry[]   = [];
  private _preview: { p1: TLPoint; p2: TLPoint | null } | null = null;
  private _chart:   IChartApi | null  = null;
  private _series:  ISeriesApi<'Candlestick'> | null = null;
  private _update:  (() => void) | null = null;
  private _nextId   = 1;

  attached(param: SeriesAttachedParameter<Time>): void {
    this._chart  = param.chart as IChartApi;
    this._series = param.series as ISeriesApi<'Candlestick'>;
    this._update = param.requestUpdate;
  }

  detached(): void {
    this._chart = null; this._series = null; this._update = null;
  }

  updateAllViews(): void { /* no-op: we re-query coords in draw() */ }

  paneViews(): readonly IPrimitivePaneView[] {
    if (!this._chart || !this._series) return [];
    return [new TrendLinePaneView(this._lines, this._chart, this._series, this._preview)];
  }

  // ── Public API called by the React component ─────────────────────────────

  setPreview(preview: { p1: TLPoint; p2: TLPoint | null } | null): void {
    this._preview = preview;
    this._update?.();
  }

  commitLine(p1: TLPoint, p2: TLPoint, ray = false): void {
    const entry = { id: this._nextId++, p1, p2, color: '#55c3e9', ray } as TLEntry & { ray: boolean };
    this._lines.push(entry);
    this._preview = null;
    this._update?.();
  }

  eraseAt(x: number, y: number): void {
    if (!this._chart || !this._series) return;
    this._lines = this._lines.filter(l => {
      const x1 = this._chart!.timeScale().timeToCoordinate(l.p1.time) ?? 0;
      const y1 = this._series!.priceToCoordinate(l.p1.price) ?? 0;
      const x2 = this._chart!.timeScale().timeToCoordinate(l.p2.time) ?? 0;
      const y2 = this._series!.priceToCoordinate(l.p2.price) ?? 0;
      return distToSegment(x, y, x1, y1, x2, y2) > 8;
    });
    this._update?.();
  }

  clearAll(): void {
    this._lines = [];
    this._preview = null;
    this._update?.();
  }
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

const TOOLS: { id: DrawTool; label: string; title: string }[] = [
  { id: 'cursor',    label: '↖',  title: 'Cursor (default)' },
  { id: 'trendline', label: '/',  title: 'Trend line' },
  { id: 'ray',       label: '→',  title: 'Ray' },
  { id: 'hline',     label: '—',  title: 'Horizontal line' },
  { id: 'erase',     label: '✕',  title: 'Erase drawings' },
];

function DrawingToolbar({ active, onChange }: { active: DrawTool; onChange: (t: DrawTool) => void }) {
  return (
    <div style={{
      position: 'absolute', left: 8, top: 8, zIndex: 10,
      display: 'flex', flexDirection: 'column', gap: 3,
      background: 'rgba(10,18,28,0.85)', border: '1px solid rgba(255,255,255,0.10)',
      borderRadius: 6, padding: 4, backdropFilter: 'blur(4px)',
    }}>
      {TOOLS.map(t => (
        <button
          key={t.id}
          title={t.title}
          onClick={() => onChange(t.id)}
          style={{
            width: 28, height: 28, border: 'none', borderRadius: 4, cursor: 'pointer',
            fontFamily: 'monospace', fontSize: t.id === 'cursor' ? 14 : 16, fontWeight: 600,
            background: active === t.id ? 'rgba(85,195,233,0.25)' : 'transparent',
            color: active === t.id ? '#55c3e9' : 'rgba(255,255,255,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.15s, color 0.15s',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  candles:        Candle[];
  currentPrice:   number;
  selectedStrike: number | null;
  intervalMs:     number;
  onLoadMore?:    () => void;
}

export function CandlestickChart({ candles, currentPrice, selectedStrike, onLoadMore }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const chartRef      = useRef<IChartApi | null>(null);
  const candleRef     = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const primitiveRef  = useRef<TrendLinePrimitive | null>(null);
  const strikeLineRef = useRef<ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']> | null>(null);
  const hLinesRef     = useRef<ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']>[]>([]);

  const [activeTool, setActiveTool] = useState<DrawTool>('cursor');
  const activeToolRef = useRef<DrawTool>('cursor');

  // Drawing interaction state
  const drawStateRef = useRef<{ drawing: boolean; p1: TLPoint | null }>({ drawing: false, p1: null });

  // Keep the ref in sync with state (needed inside event handlers)
  const handleToolChange = useCallback((t: DrawTool) => {
    activeToolRef.current = t;
    setActiveTool(t);
    // Cancel in-progress drawing
    drawStateRef.current = { drawing: false, p1: null };
    primitiveRef.current?.setPreview(null);
  }, []);

  // ── Create chart once ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0a121c' },
        textColor:  '#526a82',
        fontSize:   11,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      crosshair: {
        mode:     CrosshairMode.Normal,
        vertLine: { color: 'rgba(120,145,170,0.5)', style: LineStyle.Dashed, labelBackgroundColor: '#1e3048' },
        horzLine: { color: 'rgba(120,145,170,0.5)', style: LineStyle.Dashed, labelBackgroundColor: '#1e3048' },
      },
      rightPriceScale: {
        borderColor:  'rgba(255,255,255,0.07)',
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      timeScale: {
        borderColor:    'rgba(255,255,255,0.07)',
        timeVisible:    true,
        secondsVisible: false,
      },
      autoSize: true,
      // ── Navigation (all enabled) ──────────────────────────────────────────
      handleScroll: {
        mouseWheel:       true,
        pressedMouseMove: true,
        horzTouchDrag:    true,
        vertTouchDrag:    false, // false so vertical touch scrolls the page
      },
      handleScale: {
        axisPressedMouseMove: { time: true, price: true },
        mouseWheel:           true,
        pinch:                true,
        axisDoubleClickReset: { time: true, price: true },
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor:         '#02c77b',
      downColor:       '#eb365a',
      borderUpColor:   '#02c77b',
      borderDownColor: '#eb365a',
      wickUpColor:     '#02c77b',
      wickDownColor:   '#eb365a',
    } as CandlestickSeriesPartialOptions);

    // Attach drawing primitive
    const primitive = new TrendLinePrimitive();
    candleSeries.attachPrimitive(primitive);

    chartRef.current     = chart;
    candleRef.current    = candleSeries;
    primitiveRef.current = primitive;

    // Load-more on scroll to left edge
    if (onLoadMore) {
      chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range && range.from < 10) onLoadMore();
      });
    }

    return () => {
      chart.remove();
      chartRef.current     = null;
      candleRef.current    = null;
      primitiveRef.current = null;
      hLinesRef.current    = [];
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Feed candle data ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!candleRef.current || candles.length === 0) return;
    const data = candles.map(c => ({
      time:  Math.floor(c.timestamp / 1000) as unknown as Time,
      open:  c.open,
      high:  c.high,
      low:   c.low,
      close: c.close,
    }));
    candleRef.current.setData(data);
    chartRef.current?.timeScale().scrollToRealTime();
  }, [candles]);

  // ── Strike price line ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!candleRef.current) return;
    if (strikeLineRef.current) {
      candleRef.current.removePriceLine(strikeLineRef.current);
      strikeLineRef.current = null;
    }
    if (selectedStrike && selectedStrike > 0) {
      strikeLineRef.current = candleRef.current.createPriceLine({
        price:            selectedStrike,
        color:            '#55c3e9',
        lineWidth:        1,
        lineStyle:        LineStyle.Dashed,
        axisLabelVisible: true,
        title:            'Strike',
      });
    }
  }, [selectedStrike]);

  // ── Drawing tool mouse handlers ────────────────────────────────────────────
  const getChartPoint = useCallback((e: React.MouseEvent<HTMLDivElement>): TLPoint | null => {
    const chart   = chartRef.current;
    const series  = candleRef.current;
    const el      = containerRef.current;
    if (!chart || !series || !el) return null;

    const rect = el.getBoundingClientRect();
    const x    = e.clientX - rect.left;
    const y    = e.clientY - rect.top;

    const time  = chart.timeScale().coordinateToTime(x);
    const price = series.coordinateToPrice(y);
    if (time === null || price === null) return null;
    return { time, price };
  }, []);

  const handlePointerDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const tool = activeToolRef.current;
    if (tool === 'cursor') return;
    e.stopPropagation();

    const pt = getChartPoint(e);
    if (!pt) return;

    if (tool === 'hline') {
      // Horizontal line via built-in price line
      if (candleRef.current) {
        const pl = candleRef.current.createPriceLine({
          price:            pt.price,
          color:            '#ecca5a',
          lineWidth:        1,
          lineStyle:        LineStyle.Dashed,
          axisLabelVisible: true,
          title:            '',
        });
        hLinesRef.current.push(pl);
      }
      return;
    }

    if (tool === 'erase') {
      const el   = containerRef.current!;
      const rect = el.getBoundingClientRect();
      primitiveRef.current?.eraseAt(e.clientX - rect.left, e.clientY - rect.top);
      // Also clear nearby horizontal price lines
      if (candleRef.current) {
        const y0 = e.clientY - rect.top;
        hLinesRef.current = hLinesRef.current.filter(pl => {
          const y = candleRef.current!.priceToCoordinate((pl as unknown as { options: () => { price: number } }).options().price);
          if (y !== null && Math.abs(y - y0) < 8) {
            candleRef.current!.removePriceLine(pl);
            return false;
          }
          return true;
        });
      }
      return;
    }

    // trendline or ray — start drawing
    drawStateRef.current = { drawing: true, p1: pt };
    primitiveRef.current?.setPreview({ p1: pt, p2: null });
  }, [getChartPoint]);

  const handlePointerMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const tool = activeToolRef.current;
    if (!drawStateRef.current.drawing) return;
    if (tool !== 'trendline' && tool !== 'ray') return;

    const pt = getChartPoint(e);
    if (!pt || !drawStateRef.current.p1) return;
    primitiveRef.current?.setPreview({ p1: drawStateRef.current.p1, p2: pt });
  }, [getChartPoint]);

  const handlePointerUp = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const tool = activeToolRef.current;
    if (!drawStateRef.current.drawing) return;
    if (tool !== 'trendline' && tool !== 'ray') return;

    const pt = getChartPoint(e);
    if (pt && drawStateRef.current.p1) {
      primitiveRef.current?.commitLine(drawStateRef.current.p1, pt, tool === 'ray');
    }
    drawStateRef.current = { drawing: false, p1: null };
  }, [getChartPoint]);

  // Cursor style
  const cursorStyle: React.CSSProperties['cursor'] =
    activeTool === 'cursor'    ? 'default'   :
    activeTool === 'erase'     ? 'crosshair' :
    activeTool === 'hline'     ? 'ns-resize' :
    'crosshair';

  // ── Unused prop (currentPrice) — chart shows last close natively ──────────
  void currentPrice;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Drawing toolbar */}
      <DrawingToolbar active={activeTool} onChange={handleToolChange} />

      {/* Chart container */}
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', cursor: cursorStyle }}
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={() => {
          if (drawStateRef.current.drawing) {
            drawStateRef.current = { drawing: false, p1: null };
            primitiveRef.current?.setPreview(null);
          }
        }}
      />
    </div>
  );
}
