'use client';
import React, { useEffect, useRef } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickSeriesPartialOptions,
  type HistogramSeriesPartialOptions,
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
  const volumeRef      = useRef<ISeriesApi<'Histogram'> | null>(null);
  const strikeLineRef  = useRef<ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']> | null>(null);
  const initialScrollRef = useRef(false);

  // ── Create chart once ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    // Read CSS variables for theme-aware colors
    const cs = getComputedStyle(document.documentElement);
    const bgColor   = cs.getPropertyValue('--bg').trim()    || '#0a121c';
    const textColor = cs.getPropertyValue('--text3').trim() || '#526a82';
    const borderCol = cs.getPropertyValue('--border').trim() || 'rgba(255,255,255,0.07)';
    const bg2Color  = cs.getPropertyValue('--bg2').trim()   || '#111e2c';

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: bgColor },
        textColor,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: borderCol + '30' },
        horzLines: { color: borderCol + '30' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(120,145,170,0.5)', style: LineStyle.Dashed, labelBackgroundColor: bg2Color },
        horzLine: { color: 'rgba(120,145,170,0.5)', style: LineStyle.Dashed, labelBackgroundColor: bg2Color },
      },
      rightPriceScale: {
        borderColor: borderCol,
        scaleMargins: { top: 0.05, bottom: 0.28 },
      },
      timeScale: {
        borderColor: borderCol,
        timeVisible: true,
        secondsVisible: false,
        lockVisibleTimeRangeOnResize: true,
      },
      autoSize: true,
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: { time: true, price: true },
        mouseWheel: true,
        pinch: true,
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

    // Volume in the lower portion of the same chart — synchronized by default
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat:  { type: 'volume' },
      priceScaleId: 'vol',
    } as HistogramSeriesPartialOptions);
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    });

    chartRef.current  = chart;
    candleRef.current = candleSeries;
    volumeRef.current = volumeSeries;

    if (onLoadMore) {
      chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range && range.from < 10) onLoadMore();
      });
    }

    return () => {
      chart.remove();
      chartRef.current  = null;
      candleRef.current = null;
      volumeRef.current = null;
      initialScrollRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Feed candle + volume data ──────────────────────────────────────────────
  useEffect(() => {
    if (!candleRef.current || candles.length === 0) return;
    const t = (c: Candle) => Math.floor(c.timestamp / 1000) as unknown as Time;
    candleRef.current.setData(candles.map(c => ({
      time: t(c), open: c.open, high: c.high, low: c.low, close: c.close,
    })));
    if (volumeRef.current) {
      volumeRef.current.setData(candles.map(c => ({
        time:  t(c),
        value: c.volume,
        color: c.close >= c.open ? 'rgba(2,199,123,0.45)' : 'rgba(235,54,90,0.45)',
      })));
    }
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
