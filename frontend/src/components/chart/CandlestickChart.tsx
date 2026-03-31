'use client';
import React, { useEffect, useRef } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickSeriesPartialOptions,
  type Time,
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
  const containerRef   = useRef<HTMLDivElement>(null);
  const chartRef       = useRef<IChartApi | null>(null);
  const candleRef      = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const strikeLineRef  = useRef<ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']> | null>(null);
  const initialScrollRef = useRef(false);

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
        lockVisibleTimeRangeOnResize: true,
      },
      autoSize: true,
      handleScroll: {
        mouseWheel:       true,
        pressedMouseMove: true,
        horzTouchDrag:    true,
        vertTouchDrag:    false,
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

    chartRef.current  = chart;
    candleRef.current = candleSeries;

    if (onLoadMore) {
      chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range && range.from < 10) onLoadMore();
      });
    }

    return () => {
      chart.remove();
      chartRef.current  = null;
      candleRef.current = null;
      initialScrollRef.current = false;
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
    // Only scroll to real time on the very first data load — after that the
    // user is free to navigate wherever they want without being snapped back.
    if (!initialScrollRef.current) {
      chartRef.current?.timeScale().scrollToRealTime();
      initialScrollRef.current = true;
    }
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

  void currentPrice;

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%' }}
    />
  );
}
