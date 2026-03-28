'use client';
import { useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import type { TradeFormState } from '@/types';

interface Props {
  form: TradeFormState;
  spot: number;
  premium: number; // total cost incl. fee, USDC
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtPrice(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(v >= 10_000 ? 0 : 1)}k`;
  if (v >= 100)       return `$${v.toFixed(0)}`;
  if (v >= 1)         return `$${v.toFixed(2)}`;
  return `$${v.toFixed(4)}`;
}

function fmtPnl(v: number): string {
  const sign = v >= 0 ? '+' : '';
  const abs = Math.abs(v);
  if (abs >= 1000) return `${sign}$${(v / 1000).toFixed(1)}k`;
  return `${sign}$${v.toFixed(2)}`;
}

// ── Custom tooltip ─────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const pnl: number = payload[0]?.payload?.pnl ?? 0;
  const isProfit = pnl >= 0;
  return (
    <div className="bg-[#0a0a0f] border border-[#1a1a2e] rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="text-gray-500 mb-1">Price at expiry: <span className="text-gray-200 font-mono">{fmtPrice(label)}</span></div>
      <div className={`font-mono font-semibold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
        P&amp;L: {fmtPnl(pnl)}
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function BreakevenChart({ form, spot, premium }: Props) {
  const { strike, optionType, size, market } = form;
  const isCall = optionType === 'Call';

  // Generate P&L curve data
  const { data, breakevenPrice, maxProfit } = useMemo(() => {
    if (!spot || !strike || !size || premium <= 0) {
      return { data: [], breakevenPrice: null, maxProfit: null };
    }

    // Price range: 55 % – 145 % of current spot
    const low  = spot * 0.55;
    const high = spot * 1.45;
    const STEPS = 120;
    const step  = (high - low) / STEPS;

    const pts = Array.from({ length: STEPS + 1 }, (_, i) => {
      const price  = low + i * step;
      const payoff = isCall
        ? Math.max(price - strike, 0) * size
        : Math.max(strike - price, 0) * size;
      const pnl = payoff - premium;
      return {
        price,
        pnl,
        // Split into two series for coloring
        pnlPos: pnl >= 0 ? pnl : null,
        pnlNeg: pnl <  0 ? pnl : null,
        // Continuous area fill reference (always present)
        pnlFill: pnl,
      };
    });

    const be   = isCall ? strike + premium / size : strike - premium / size;
    const mxP  = isCall ? null : Math.max(strike * size - premium, 0);

    return { data: pts, breakevenPrice: be, maxProfit: mxP };
  }, [spot, strike, size, premium, isCall]);

  if (!spot || !strike || data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-600 text-sm">
        Fill in option parameters to see the breakeven curve
      </div>
    );
  }

  const maxLoss = -premium;
  const allPnls = data.map((d) => d.pnl);
  const yMin    = Math.min(...allPnls) * 1.15;
  const yMax    = Math.max(...allPnls) * 1.15 || premium * 3;

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-200">Breakeven Analysis</h3>
          <p className="text-xs text-gray-600 mt-0.5">
            {market} {optionType} · P&amp;L at expiry vs price
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs">
          {breakevenPrice && (
            <span className="text-gray-500">
              BE: <span className="text-cyan-400 font-mono font-semibold">{fmtPrice(breakevenPrice)}</span>
            </span>
          )}
          <span className="text-gray-500">
            Max loss: <span className="text-red-400 font-mono">{fmtPnl(maxLoss)}</span>
          </span>
          {maxProfit !== null ? (
            <span className="text-gray-500">
              Max profit: <span className="text-green-400 font-mono">{fmtPnl(maxProfit)}</span>
            </span>
          ) : (
            <span className="text-green-400 text-[10px]">Unlimited upside</span>
          )}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
          <defs>
            <linearGradient id="gradProfit" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#22c55e" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="gradLoss" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#ef4444" stopOpacity={0.02} />
              <stop offset="100%" stopColor="#ef4444" stopOpacity={0.3} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="#1a1a2e" vertical={false} />

          <XAxis
            dataKey="price"
            type="number"
            scale="linear"
            domain={['dataMin', 'dataMax']}
            tickFormatter={fmtPrice}
            stroke="#374151"
            tick={{ fill: '#6b7280', fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: '#1f2937' }}
            minTickGap={40}
          />
          <YAxis
            tickFormatter={fmtPnl}
            stroke="#374151"
            tick={{ fill: '#6b7280', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            domain={[yMin, yMax]}
            width={54}
          />

          <Tooltip content={<CustomTooltip />} />

          {/* Zero breakeven reference */}
          <ReferenceLine y={0} stroke="#374151" strokeWidth={1.5} />

          {/* Strike price */}
          <ReferenceLine
            x={strike}
            stroke="#4b5563"
            strokeDasharray="5 4"
            label={{ value: 'K', position: 'insideTopRight', fill: '#6b7280', fontSize: 9, dy: -2 }}
          />

          {/* Current spot */}
          <ReferenceLine
            x={spot}
            stroke="#6b7280"
            strokeDasharray="3 3"
            strokeWidth={1}
            label={{ value: 'Spot', position: 'insideTopLeft', fill: '#6b7280', fontSize: 9, dy: -2 }}
          />

          {/* Breakeven price */}
          {breakevenPrice && (
            <ReferenceLine
              x={breakevenPrice}
              stroke="#22d3ee"
              strokeDasharray="4 3"
              strokeWidth={1.5}
              label={{ value: 'BE', position: 'insideTopRight', fill: '#22d3ee', fontSize: 9, dy: -2 }}
            />
          )}

          {/* Profit area (above zero) */}
          <Area
            type="monotone"
            dataKey="pnlPos"
            stroke="#22c55e"
            strokeWidth={2}
            fill="url(#gradProfit)"
            dot={false}
            activeDot={false}
            connectNulls={false}
          />

          {/* Loss area (below zero) */}
          <Area
            type="monotone"
            dataKey="pnlNeg"
            stroke="#ef4444"
            strokeWidth={2}
            fill="url(#gradLoss)"
            dot={false}
            activeDot={false}
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
