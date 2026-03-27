'use client';
import { useMemo } from 'react';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  Legend,
} from 'recharts';
import type { IVSurface as IVSurfaceType, Market } from '@/types';
import { blackScholes } from '@/lib/black_scholes';

const MATURITIES = [1, 3, 7, 14, 30];
const STRIKE_PCTS = [80, 85, 90, 95, 100, 105, 110, 115, 120];

function ssvi(k: number, atm_iv: number, rho: number, phi: number): number {
  // Simplified SSVI: σ(k) = ATM_IV * exp(rho*k + phi*k²)
  // k = log(K/F)
  return atm_iv * Math.exp(rho * k + phi * k * k);
}

interface Props {
  market: Market;
  spot: number;
  atmIV: number;
  rho?: number;
  phi?: number;
}

export function IVSurface({ market, spot, atmIV, rho = -0.1, phi = 0.05 }: Props) {
  const data = useMemo(() => {
    if (spot <= 0 || atmIV <= 0) return [];

    const points: Array<{
      maturity: number;
      strikePct: number;
      iv: number;
      callPrice: number;
      putPrice: number;
    }> = [];

    for (const days of MATURITIES) {
      const T = days / 365.25;
      for (const pct of STRIKE_PCTS) {
        const strike = spot * (pct / 100);
        const k = Math.log(strike / spot);
        const iv = Math.min(Math.max(ssvi(k, atmIV, rho, phi), 0.1), 5.0);

        const call = blackScholes(spot, strike, iv, T, true);
        const put = blackScholes(spot, strike, iv, T, false);

        points.push({
          maturity: days,
          strikePct: pct,
          iv: iv * 100, // as %
          callPrice: call.price,
          putPrice: put.price,
        });
      }
    }

    return points;
  }, [spot, atmIV, rho, phi]);

  const ivToColor = (iv: number) => {
    // Low IV → cyan, high IV → red
    const norm = Math.min((iv - 30) / 120, 1);
    if (norm < 0.5) {
      const g = Math.round(norm * 2 * 255);
      return `rgb(0, ${g}, 255)`;
    } else {
      const r = Math.round((norm - 0.5) * 2 * 255);
      return `rgb(${r}, 0, 255)`;
    }
  };

  // Smile chart: IV vs strike % for each maturity
  const smileData = MATURITIES.map((days) => ({
    maturity: days,
    points: data.filter((d) => d.maturity === days),
  }));

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: { maturity: number; strikePct: number; iv: number; callPrice: number; putPrice: number } }> }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-[#0f0f18] border border-[#2a2a4a] rounded-lg p-3 text-xs shadow-xl">
        <div className="font-medium text-gray-200 mb-1">
          {d.maturity}D · {d.strikePct}% of Spot
        </div>
        <div className="space-y-0.5 text-gray-400">
          <div>
            IV: <span className="text-cyan-400 font-mono">{d.iv.toFixed(1)}%</span>
          </div>
          <div>
            Call: <span className="text-green-400 font-mono">${d.callPrice.toFixed(4)}</span>
          </div>
          <div>
            Put: <span className="text-purple-400 font-mono">${d.putPrice.toFixed(4)}</span>
          </div>
          <div>
            Strike: <span className="text-gray-300 font-mono">${(spot * d.strikePct / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">IV Surface — {market}</h3>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>ATM IV: <span className="text-cyan-400 font-mono">{(atmIV * 100).toFixed(1)}%</span></span>
          <span>Spot: <span className="text-gray-300 font-mono">${spot.toLocaleString()}</span></span>
        </div>
      </div>

      {/* Scatter plot: strike vs IV, colored by maturity */}
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a2e" />
            <XAxis
              dataKey="strikePct"
              type="number"
              domain={[75, 125]}
              tickFormatter={(v) => `${v}%`}
              tick={{ fontSize: 10, fill: '#6b7280' }}
              axisLine={{ stroke: '#1a1a2e' }}
              tickLine={false}
            />
            <YAxis
              dataKey="iv"
              type="number"
              domain={['auto', 'auto']}
              tickFormatter={(v) => `${v.toFixed(0)}%`}
              tick={{ fontSize: 10, fill: '#6b7280' }}
              axisLine={{ stroke: '#1a1a2e' }}
              tickLine={false}
              width={36}
            />
            <ZAxis range={[30, 30]} />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#2a2a4a' }} />
            {smileData.map(({ maturity, points }) => (
              <Scatter
                key={maturity}
                name={`${maturity}D`}
                data={points}
                fill={
                  maturity === 1 ? '#06b6d4' :
                  maturity === 3 ? '#8b5cf6' :
                  maturity === 7 ? '#10b981' :
                  maturity === 14 ? '#f59e0b' : '#ef4444'
                }
                opacity={0.9}
                line={{ stroke: 'currentColor', strokeWidth: 1.5, opacity: 0.5 }}
              />
            ))}
            <Legend
              wrapperStyle={{ fontSize: 10, color: '#6b7280' }}
              formatter={(value) => <span style={{ color: '#9ca3af' }}>{value}</span>}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Heatmap grid */}
      <div>
        <div className="text-xs text-gray-500 mb-2">IV Heatmap (strike % × maturity)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="text-left py-1 pr-2 text-gray-600 font-normal">Strike</th>
                {MATURITIES.map((d) => (
                  <th key={d} className="py-1 px-2 text-gray-500 font-medium text-center">{d}D</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {STRIKE_PCTS.map((pct) => (
                <tr key={pct}>
                  <td className={`py-1 pr-2 font-mono ${pct === 100 ? 'text-cyan-400' : 'text-gray-500'}`}>
                    {pct}%
                  </td>
                  {MATURITIES.map((days) => {
                    const point = data.find((d) => d.maturity === days && d.strikePct === pct);
                    const iv = point?.iv ?? 0;
                    return (
                      <td key={days} className="py-0.5 px-1 text-center">
                        <span
                          className="inline-block px-1.5 py-0.5 rounded font-mono"
                          style={{
                            backgroundColor: `${ivToColor(iv)}20`,
                            color: ivToColor(iv),
                            minWidth: 44,
                          }}
                        >
                          {iv.toFixed(0)}%
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
