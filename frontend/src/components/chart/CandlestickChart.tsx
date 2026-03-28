'use client';
import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { Candle } from '@/types';

// ── Layout ─────────────────────────────────────────────────────────────────
const PX_W   = 76;    // price axis width (right)
const TX_H   = 24;    // time axis height (bottom)
const VOL_R  = 0.14;  // volume panel fraction of chart height
const OHLC_Y = 10;    // top-left OHLC text baseline Y

const MIN_VIS = 8;
const MAX_VIS = 500;
const DEF_VIS = 80;

// ── Colors ─────────────────────────────────────────────────────────────────
const C_UP    = '#02c77b';
const C_DOWN  = '#eb365a';
const C_CYAN  = '#55c3e9';
const C_AMBER = '#ecca5a';
const C_GRID  = 'rgba(255,255,255,0.04)';
const C_LBL   = '#526a82';
const C_XHAIR = 'rgba(120,145,170,0.6)';
const C_BG    = '#0a121c';

// ── Formatters ─────────────────────────────────────────────────────────────
function fmtPrice(v: number): string {
  if (v >= 10000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (v >= 1000)  return v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (v >= 1)     return v.toFixed(2);
  return v.toFixed(4);
}

function fmtTime(ts: number, ms: number): string {
  const d = new Date(ts);
  if (ms < 3_600_000)  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  if (ms < 86_400_000) return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}h`;
  const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
  return `${d.getDate()} ${mo}`;
}

// ── Nice round grid levels ─────────────────────────────────────────────────
function niceGrid(lo: number, hi: number): number[] {
  const span = hi - lo;
  if (span <= 0) return [];
  const rough = span / 6;
  const mag   = Math.pow(10, Math.floor(Math.log10(rough)));
  const step  = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => span / s <= 8) ?? rough;
  const first = Math.ceil(lo / step) * step;
  const out: number[] = [];
  let v = first;
  while (v < hi && out.length < 12) {
    if (v > lo) out.push(parseFloat(v.toPrecision(10)));
    v = parseFloat((v + step).toPrecision(12));
  }
  return out;
}

// ── Rounded rect helper (safe across browsers) ─────────────────────────────
function rRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── View state ─────────────────────────────────────────────────────────────
interface View { visibleCount: number; offset: number; yScale: number; }

// ── Computed layout metrics (shared between both draw passes) ───────────────
interface Metrics {
  W: number; H: number;       // CSS dimensions
  cW: number; cH: number;     // chart area (W - PX_W, H - TX_H)
  pH: number; vH: number;     // price panel, volume panel heights
  pHi: number; pLo: number; pSpan: number;
  toY: (p: number) => number;
  toVH: (v: number) => number;
  cw: number; bw: number;     // candle width, body width
  vis: Candle[];
}

function computeMetrics(candles: Candle[], view: View, W: number, H: number): Metrics | null {
  if (!candles.length) return null;
  const cW  = W - PX_W;
  const cH  = H - TX_H;
  const vH  = cH * VOL_R;
  const pH  = cH - vH;
  const end = Math.max(0, candles.length - view.offset);
  const st  = Math.max(0, end - view.visibleCount);
  const vis = candles.slice(st, end);
  if (!vis.length) return null;

  const rawHi = Math.max(...vis.map(c => c.high));
  const rawLo = Math.min(...vis.map(c => c.low));
  const mid   = (rawHi + rawLo) / 2;
  const half  = ((rawHi - rawLo) / 2 || mid * 0.01) * view.yScale * 1.05;
  const pHi   = mid + half;
  const pLo   = mid - half;
  const pSpan = pHi - pLo || 1;
  const vMax  = Math.max(...vis.map(c => c.volume)) || 1;
  const cw    = cW / vis.length;
  const bw    = Math.max(1, cw * 0.6);

  return {
    W, H, cW, cH, pH, vH, pHi, pLo, pSpan,
    toY:  (p) => ((pHi - p) / pSpan) * pH,
    toVH: (v) => (v / vMax) * vH * 0.85,
    cw, bw, vis,
  };
}

// ── Draw static layer ──────────────────────────────────────────────────────
function drawStatic(
  canvas: HTMLCanvasElement,
  candles: Candle[],
  currentPrice: number,
  selectedStrike: number | null,
  view: View,
  intervalMs: number,
  dpr: number,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width / dpr;
  const H = canvas.height / dpr;
  const m = computeMetrics(candles, view, W, H);

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  if (!m) { ctx.restore(); return; }
  const { cW, cH, pH, vH, pHi, pLo, pSpan, toY, toVH, cw, bw, vis } = m;

  // ── Price axis separator ──
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth   = 1;
  ctx.beginPath(); ctx.moveTo(cW, 0); ctx.lineTo(cW, cH); ctx.stroke();

  // ── Grid + Y-axis labels ──
  const levels = niceGrid(pLo, pHi);
  ctx.font      = `10px 'IBM Plex Mono', monospace`;
  ctx.textAlign = 'right';
  levels.forEach(lv => {
    const y = toY(lv);
    if (y < 2 || y > pH - 2) return;
    // Grid line
    ctx.strokeStyle = C_GRID;
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cW, y); ctx.stroke();
    // Label
    ctx.fillStyle = C_LBL;
    ctx.fillText(fmtPrice(lv), W - 5, y + 3.5);
  });

  // ── Volume divider ──
  ctx.strokeStyle = C_GRID;
  ctx.lineWidth   = 1;
  ctx.setLineDash([2, 4]);
  ctx.beginPath(); ctx.moveTo(0, pH); ctx.lineTo(cW, pH); ctx.stroke();
  ctx.setLineDash([]);

  // ── Candles + volume ──
  vis.forEach((c, i) => {
    const cx  = i * cw + cw / 2;
    const up  = c.close >= c.open;
    const col = up ? C_UP : C_DOWN;

    const bTop = toY(Math.max(c.open, c.close));
    const bBot = toY(Math.min(c.open, c.close));
    const bH   = Math.max(1, bBot - bTop);
    const wickW = Math.max(1, Math.min(1.5, cw * 0.12));

    // Wick
    ctx.strokeStyle = col;
    ctx.lineWidth   = wickW;
    ctx.beginPath(); ctx.moveTo(cx, toY(c.high)); ctx.lineTo(cx, toY(c.low)); ctx.stroke();

    // Body
    ctx.fillStyle = col;
    if (bH <= 1) {
      ctx.fillRect(cx - bw / 2, bTop, bw, 1);
    } else {
      ctx.fillRect(cx - bw / 2, bTop, bw, bH);
    }

    // Volume bar
    const vh = toVH(c.volume);
    ctx.fillStyle = up ? 'rgba(2,199,123,0.22)' : 'rgba(235,54,90,0.22)';
    ctx.fillRect(cx - bw / 2, cH - vh, bw, vh);
  });

  // ── Time axis labels ──
  ctx.fillStyle = C_LBL;
  ctx.font      = `10px 'IBM Plex Mono', monospace`;
  ctx.textAlign = 'center';
  const maxTL   = Math.max(2, Math.floor(cW / 72));
  const step    = Math.max(1, Math.ceil(vis.length / maxTL));
  for (let i = 0; i < vis.length; i += step) {
    const x = i * cw + cw / 2;
    if (x < 10 || x > cW - 10) continue;
    ctx.fillText(fmtTime(vis[i].timestamp, intervalMs), x, H - 7);
  }

  // ── Current price line + pill ──
  if (currentPrice > 0) {
    const y = toY(currentPrice);
    if (y >= 0 && y <= pH) {
      ctx.strokeStyle = C_CYAN;
      ctx.lineWidth   = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cW, y); ctx.stroke();
      ctx.setLineDash([]);

      const label = fmtPrice(currentPrice);
      const pillH = 17;
      const pillW = PX_W - 4;
      ctx.fillStyle = C_CYAN;
      rRect(ctx, cW + 2, y - pillH / 2, pillW, pillH, 3);
      ctx.fill();
      ctx.fillStyle   = C_BG;
      ctx.font        = `bold 10px 'IBM Plex Mono', monospace`;
      ctx.textAlign   = 'center';
      ctx.fillText(label, cW + 2 + pillW / 2, y + 4);
    }
  }

  // ── Strike line + pill ──
  if (selectedStrike && selectedStrike > 0) {
    const y = toY(selectedStrike);
    if (y >= 0 && y <= pH) {
      ctx.strokeStyle = `${C_AMBER}aa`;
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cW, y); ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = `${C_AMBER}cc`;
      ctx.font      = `9px 'IBM Plex Mono', monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(`K ${fmtPrice(selectedStrike)}`, 5, y - 4);

      const pillH = 16;
      const pillW = PX_W - 4;
      ctx.fillStyle = 'rgba(236,202,90,0.15)';
      rRect(ctx, cW + 2, y - pillH / 2, pillW, pillH, 3);
      ctx.fill();
      ctx.strokeStyle = `${C_AMBER}88`;
      ctx.lineWidth   = 0.5;
      rRect(ctx, cW + 2, y - pillH / 2, pillW, pillH, 3);
      ctx.stroke();
      ctx.fillStyle = `${C_AMBER}ee`;
      ctx.font      = `9px 'IBM Plex Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(fmtPrice(selectedStrike), cW + 2 + pillW / 2, y + 3.5);
    }
  }

  ctx.restore();
}

// ── Draw crosshair + OHLC overlay ─────────────────────────────────────────
function drawCrosshair(
  canvas: HTMLCanvasElement,
  mx: number, my: number,
  candles: Candle[],
  view: View,
  intervalMs: number,
  dpr: number,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width / dpr;
  const H = canvas.height / dpr;
  const m = computeMetrics(candles, view, W, H);

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  if (!m || mx < 0) { ctx.restore(); return; }
  const { cW, cH, pH, pHi, pLo, pSpan, toY, cw, vis } = m;

  const inChart = mx >= 0 && mx <= cW && my >= 0 && my <= cH;
  if (!inChart) { ctx.restore(); return; }

  // ── Crosshair lines ──
  ctx.strokeStyle = C_XHAIR;
  ctx.lineWidth   = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(mx, 0); ctx.lineTo(mx, cH); ctx.stroke();
  if (my <= pH) {
    ctx.beginPath(); ctx.moveTo(0, my); ctx.lineTo(cW, my); ctx.stroke();
  }
  ctx.setLineDash([]);

  // ── Y-axis cursor price label ──
  if (my >= 0 && my <= pH) {
    const cursorPrice = pHi - (my / pH) * pSpan;
    const label  = fmtPrice(cursorPrice);
    const pillH  = 17;
    const pillW  = PX_W - 4;
    ctx.fillStyle = '#1e3048';
    rRect(ctx, cW + 2, my - pillH / 2, pillW, pillH, 3);
    ctx.fill();
    ctx.strokeStyle = C_XHAIR;
    ctx.lineWidth   = 0.5;
    rRect(ctx, cW + 2, my - pillH / 2, pillW, pillH, 3);
    ctx.stroke();
    ctx.fillStyle   = '#c0d4e8';
    ctx.font        = `10px 'IBM Plex Mono', monospace`;
    ctx.textAlign   = 'center';
    ctx.fillText(label, cW + 2 + pillW / 2, my + 4);
  }

  // ── X-axis cursor time label ──
  const cidx = Math.min(Math.floor(mx / cw), vis.length - 1);
  const hCandle = cidx >= 0 ? vis[cidx] : null;
  if (hCandle) {
    const label = fmtTime(hCandle.timestamp, intervalMs);
    ctx.font = `10px 'IBM Plex Mono', monospace`;
    const tw  = ctx.measureText(label).width;
    const pillH = 17;
    const pillW = tw + 14;
    const px  = cidx * cw + cw / 2;
    const lx  = Math.max(2, Math.min(cW - pillW - 2, px - pillW / 2));

    ctx.fillStyle = '#1e3048';
    rRect(ctx, lx, H - TX_H + 1, pillW, pillH, 3);
    ctx.fill();
    ctx.strokeStyle = C_XHAIR;
    ctx.lineWidth   = 0.5;
    rRect(ctx, lx, H - TX_H + 1, pillW, pillH, 3);
    ctx.stroke();
    ctx.fillStyle = '#c0d4e8';
    ctx.textAlign = 'center';
    ctx.fillText(label, lx + pillW / 2, H - TX_H + 12);
  }

  // ── OHLC display (top-left of chart area, like Pacifica) ──
  if (hCandle) {
    const c    = hCandle;
    const up   = c.close >= c.open;
    const chg  = ((c.close - c.open) / c.open) * 100;
    const chgS = `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`;
    const col  = up ? C_UP : C_DOWN;

    ctx.font = `10px 'IBM Plex Mono', monospace`;

    const items: [string, string, string][] = [
      ['O', fmtPrice(c.open),  '#c0d4e8'],
      ['H', fmtPrice(c.high),  C_UP],
      ['L', fmtPrice(c.low),   C_DOWN],
      ['C', fmtPrice(c.close), '#c0d4e8'],
    ];

    let ox = 6;
    const oy = OHLC_Y + 12;

    items.forEach(([key, val, valCol]) => {
      ctx.fillStyle = C_LBL;
      ctx.textAlign = 'left';
      ctx.fillText(key, ox, oy);
      ox += ctx.measureText(key).width + 2;
      ctx.fillStyle = valCol;
      ctx.fillText(val, ox, oy);
      ox += ctx.measureText(val).width + 10;
    });

    ctx.fillStyle = col;
    ctx.fillText(chgS, ox, oy);
  }

  ctx.restore();
}

// ── Props ──────────────────────────────────────────────────────────────────
interface Props {
  candles:        Candle[];
  currentPrice:   number;
  selectedStrike: number | null;
  intervalMs:     number;
}

// ── Component ──────────────────────────────────────────────────────────────
export function CandlestickChart({ candles, currentPrice, selectedStrike, intervalMs }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const staticRef    = useRef<HTMLCanvasElement>(null);
  const crossRef     = useRef<HTMLCanvasElement>(null);

  const viewRef     = useRef<View>({ visibleCount: DEF_VIS, offset: 0, yScale: 1 });
  const dragRef     = useRef<{ startX: number; startOffset: number } | null>(null);
  const mouseRef    = useRef({ x: -1, y: -1 });
  const rafRef      = useRef(0);
  const candlesRef  = useRef(candles);
  const intervalRef = useRef(intervalMs);
  const [isDragging, setIsDragging] = useState(false);

  // Keep refs current so stable callbacks can access latest values
  useEffect(() => { candlesRef.current  = candles;    }, [candles]);
  useEffect(() => { intervalRef.current = intervalMs; }, [intervalMs]);

  const getDPR  = () => window.devicePixelRatio || 1;
  const getSize = useCallback(() => {
    const el = containerRef.current;
    return { W: el?.clientWidth ?? 800, H: el?.clientHeight ?? 400 };
  }, []);

  const sizeCanvas = useCallback((c: HTMLCanvasElement, W: number, H: number, dpr: number) => {
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width  = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
      c.style.width  = `${W}px`;
      c.style.height = `${H}px`;
    }
  }, []);

  const redrawStatic = useCallback(() => {
    const sc = staticRef.current;
    if (!sc) return;
    const dpr = getDPR();
    const { W, H } = getSize();
    sizeCanvas(sc, W, H, dpr);
    drawStatic(sc, candlesRef.current, currentPrice, selectedStrike, viewRef.current, intervalRef.current, dpr);
  }, [currentPrice, selectedStrike, getSize, sizeCanvas]);

  const redrawCross = useCallback(() => {
    const cc = crossRef.current;
    if (!cc) return;
    const dpr = getDPR();
    const { W, H } = getSize();
    sizeCanvas(cc, W, H, dpr);
    drawCrosshair(cc, mouseRef.current.x, mouseRef.current.y, candlesRef.current, viewRef.current, intervalRef.current, dpr);
  }, [getSize, sizeCanvas]);

  // Redraw on data/prop change
  useEffect(() => { redrawStatic(); }, [redrawStatic]);
  // Also redraw when candles update (ref won't trigger the above)
  useEffect(() => { redrawStatic(); }, [candles, redrawStatic]);

  // ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { redrawStatic(); redrawCross(); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [redrawStatic, redrawCross]);

  // ── Wheel (non-passive so preventDefault works) ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      if (e.shiftKey) {
        // Y zoom
        const f = e.deltaY > 0 ? 1.12 : 0.89;
        viewRef.current = { ...v, yScale: Math.max(0.3, Math.min(12, v.yScale * f)) };
      } else {
        // X zoom (candle count)
        const f    = e.deltaY > 0 ? 1.12 : 0.89;
        const next = Math.round(v.visibleCount * f);
        viewRef.current = { ...v, visibleCount: Math.max(MIN_VIS, Math.min(MAX_VIS, next)) };
      }
      redrawStatic();
      redrawCross();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [redrawStatic, redrawCross]);

  // ── Global mousemove + mouseup (so drag continues outside the div) ──
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const v       = viewRef.current;
      const { W }   = getSize();
      const pxPer   = (W - PX_W) / v.visibleCount;
      const delta   = Math.round(-(e.clientX - dragRef.current.startX) / pxPer);
      const maxOff  = Math.max(0, candlesRef.current.length - v.visibleCount);
      viewRef.current = { ...v, offset: Math.max(0, Math.min(maxOff, dragRef.current.startOffset + delta)) };
      redrawStatic();

      // Update crosshair position relative to container
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(redrawCross);
      }
    };

    const onUp = () => {
      dragRef.current = null;
      setIsDragging(false);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    };
  }, [getSize, redrawStatic, redrawCross]);

  // ── Mouse down: start drag ──
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = { startX: e.clientX, startOffset: viewRef.current.offset };
    setIsDragging(true);
  }, []);

  // ── Mouse move: crosshair only (pan handled globally above) ──
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragRef.current) return; // global handler covers this case
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(redrawCross);
  }, [redrawCross]);

  const handleMouseLeave = useCallback(() => {
    if (dragRef.current) return; // keep crosshair while dragging outside
    mouseRef.current = { x: -1, y: -1 };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(redrawCross);
  }, [redrawCross]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%', height: '100%', position: 'relative',
        cursor: isDragging ? 'grabbing' : 'crosshair',
        overflow: 'hidden', userSelect: 'none',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <canvas ref={staticRef} style={{ position: 'absolute', inset: 0 }} />
      <canvas ref={crossRef}  style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
    </div>
  );
}
