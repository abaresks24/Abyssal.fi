'use client';
/**
 * CandlestickChart — powered by TradingView lightweight-charts v4
 * https://github.com/tradingview/lightweight-charts
 *
 * No custom toolbar. All interactions (crosshair, zoom, scroll, price scale)
 * are handled natively by the library.
 */
import React, { useEffect, useRef } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type CandlestickSeriesOptions,
} from 'lightweight-charts';
import type { Candle } from '@/types';

interface Props {
  candles:        Candle[];
  currentPrice:   number;
  selectedStrike: number | null;
  intervalMs:     number;
  onLoadMore?:    () => void;
}

export function CandlestickChart({ candles, currentPrice, selectedStrike, onLoadMore }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const candleRef    = useRef<ISeriesApi<'Candlestick'> | null>(null);

  // ── Create chart once ───────────────────────────────────────────────────────
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
        mode:      CrosshairMode.Normal,
        vertLine:  { color: 'rgba(120,145,170,0.5)', style: LineStyle.Dashed, labelBackgroundColor: '#1e3048' },
        horzLine:  { color: 'rgba(120,145,170,0.5)', style: LineStyle.Dashed, labelBackgroundColor: '#1e3048' },
      },
      rightPriceScale: {
        borderColor:    'rgba(255,255,255,0.07)',
        scaleMargins:   { top: 0.08, bottom: 0.08 },
      },
      timeScale: {
        borderColor:    'rgba(255,255,255,0.07)',
        timeVisible:    true,
        secondsVisible: false,
        fixLeftEdge:    false,
        fixRightEdge:   false,
      },
      autoSize: true,
      handleScale: {
        axisPressedMouseMove: { time: true, price: true },
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor:          '#02c77b',
      downColor:        '#eb365a',
      borderUpColor:    '#02c77b',
      borderDownColor:  '#eb365a',
      wickUpColor:      '#02c77b',
      wickDownColor:    '#eb365a',
    } as Partial<CandlestickSeriesOptions>);

    chartRef.current   = chart;
    candleRef.current  = candleSeries;

    // Load more candles when scrolling to the left edge
    if (onLoadMore) {
      chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range && range.from < 10) onLoadMore();
      });
    }

    return () => {
      chart.remove();
      chartRef.current  = null;
      candleRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Feed candle data ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!candleRef.current || candles.length === 0) return;
    // lightweight-charts expects time in seconds (UTC)
    const data = candles.map(c => ({
      time: Math.floor(c.timestamp / 1000) as unknown as import('lightweight-charts').Time,
      open:  c.open,
      high:  c.high,
      low:   c.low,
      close: c.close,
    }));
    candleRef.current.setData(data);
    // Scroll to the latest candle on first load
    chartRef.current?.timeScale().scrollToRealTime();
  }, [candles]);

  // ── Current price line ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!candleRef.current || currentPrice <= 0) return;
    candleRef.current.applyOptions({
      lastValueVisible: true,
      priceLineVisible: true,
    });
  }, [currentPrice]);

  // ── Strike price line ────────────────────────────────────────────────────────
  const strikeLine = useRef<ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']> | null>(null);

  useEffect(() => {
    if (!candleRef.current) return;
    if (strikeLine.current) {
      candleRef.current.removePriceLine(strikeLine.current);
      strikeLine.current = null;
    }
    if (selectedStrike && selectedStrike > 0) {
      strikeLine.current = candleRef.current.createPriceLine({
        price:           selectedStrike,
        color:           '#55c3e9',
        lineWidth:       1,
        lineStyle:       LineStyle.Dashed,
        axisLabelVisible: true,
        title:           'Strike',
      });
    }
  }, [selectedStrike]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%' }}
    />
  );
}
