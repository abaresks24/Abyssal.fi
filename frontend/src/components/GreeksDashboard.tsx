'use client';
import type { Greeks } from '@/types';

interface GreekBarProps {
  label: string;
  symbol: string;
  value: number;
  description: string;
  formatter?: (v: number) => string;
  color?: string;
  min?: number;
  max?: number;
}

function GreekBar({ label, symbol, value, description, formatter, color = 'cyan', min = -1, max = 1 }: GreekBarProps) {
  const fmt = formatter ?? ((v: number) => v.toFixed(4));
  const range = max - min;
  const pct = Math.min(Math.max((value - min) / range, 0), 1) * 100;
  const colorMap: Record<string, string> = {
    cyan: 'bg-cyan-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    purple: 'bg-purple-500',
    red: 'bg-red-500',
  };
  const bar = colorMap[color] ?? 'bg-cyan-500';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-gray-300">{symbol}</span>
          <span className="text-xs text-gray-500">{label}</span>
        </div>
        <span className="font-mono text-sm font-medium text-gray-200">{fmt(value)}</span>
      </div>
      <div className="h-1 bg-[#1a1a2e] rounded-full overflow-hidden">
        <div
          className={`h-full ${bar} rounded-full transition-all duration-300`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-gray-600">{description}</p>
    </div>
  );
}

interface Props {
  greeks: Greeks;
  greeksTotal?: Greeks;
  spotPrice?: number;
  iv?: number;
  showTotal?: boolean;
}

export function GreeksDashboard({ greeks, greeksTotal, spotPrice, iv, showTotal = false }: Props) {
  const displayed = showTotal && greeksTotal ? greeksTotal : greeks;

  const formatUSD = (v: number) =>
    v >= 0
      ? `+$${Math.abs(v).toFixed(4)}`
      : `-$${Math.abs(v).toFixed(4)}`;

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">Greeks</h3>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {iv != null && (
            <span>
              IV: <span className="text-cyan-400 font-mono">{(iv * 100).toFixed(1)}%</span>
            </span>
          )}
          {spotPrice != null && (
            <span>
              Spot: <span className="text-gray-300 font-mono">${spotPrice.toLocaleString()}</span>
            </span>
          )}
          {greeksTotal && (
            <button
              onClick={() => {}}
              className="text-xs text-gray-500 hover:text-cyan-400 transition-colors"
            >
              {showTotal ? 'Per unit' : 'Total'}
            </button>
          )}
        </div>
      </div>

      {/* Greeks grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-[#0a0a0f] border border-[#1a1a2e] rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 uppercase tracking-wider">Delta</span>
            <span className="text-lg font-mono font-semibold text-cyan-400">
              {displayed.delta >= 0 ? '+' : ''}{displayed.delta.toFixed(4)}
            </span>
          </div>
          <p className="text-xs text-gray-600">Price sensitivity per $1 move in underlying</p>
          {spotPrice != null && (
            <p className="text-xs text-cyan-500/60 font-mono">
              ≈ ${(displayed.delta * spotPrice).toFixed(2)} per 1% spot move
            </p>
          )}
        </div>

        <div className="bg-[#0a0a0f] border border-[#1a1a2e] rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 uppercase tracking-wider">Gamma</span>
            <span className="text-lg font-mono font-semibold text-purple-400">
              {displayed.gamma.toFixed(6)}
            </span>
          </div>
          <p className="text-xs text-gray-600">Delta change per $1 move — convexity</p>
        </div>

        <div className="bg-[#0a0a0f] border border-[#1a1a2e] rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 uppercase tracking-wider">Theta</span>
            <span className={`text-lg font-mono font-semibold ${displayed.theta < 0 ? 'text-red-400' : 'text-green-400'}`}>
              {formatUSD(displayed.theta)}/day
            </span>
          </div>
          <p className="text-xs text-gray-600">Time decay — value lost per day</p>
        </div>

        <div className="bg-[#0a0a0f] border border-[#1a1a2e] rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 uppercase tracking-wider">Vega</span>
            <span className="text-lg font-mono font-semibold text-yellow-400">
              ${displayed.vega.toFixed(4)}/1%
            </span>
          </div>
          <p className="text-xs text-gray-600">P&L per 1% change in implied vol</p>
        </div>
      </div>

      {/* Delta bar */}
      <div className="space-y-2">
        <GreekBar
          label="Delta"
          symbol="Δ"
          value={displayed.delta}
          description="Net directional exposure — 0 neutral, ±1 full underlying exposure"
          color={displayed.delta > 0 ? 'cyan' : 'red'}
          min={-1}
          max={1}
        />
        <GreekBar
          label="Vega"
          symbol="ν"
          value={displayed.vega}
          description="Vol exposure per 1% IV change (USD)"
          color="yellow"
          min={0}
          max={Math.max(displayed.vega * 2, 0.01)}
          formatter={(v) => `$${v.toFixed(4)}`}
        />
      </div>
    </div>
  );
}
