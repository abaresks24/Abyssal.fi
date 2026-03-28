'use client';
import React from 'react';
import type { Side } from '@/types';

interface Props {
  strike: number;
  premium: number;
  size: number;
  side: Side;
  currentSpot: number;
}

function fmtK(v: number): string {
  if (v >= 1000) return `$${(v / 1000).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
}

function fmtPnl(v: number): string {
  const sign = v >= 0 ? '+' : '';
  if (Math.abs(v) >= 1000) return `${sign}$${(v / 1000).toFixed(1)}k`;
  return `${sign}$${v.toFixed(0)}`;
}

export const PayoffChart = React.memo(function PayoffChart({ strike, premium, size, side, currentSpot }: Props) {
  if (strike <= 0 || premium <= 0 || size <= 0 || currentSpot <= 0) {
    return (
      <div style={{ height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 11 }}>
        Enter parameters to see payoff
      </div>
    );
  }

  const W = 292;
  const H = 150;
  const PAD_L = 34;
  const PAD_R = 8;
  const PAD_T = 10;
  const PAD_B = 18;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const xMin = strike * 0.75;
  const xMax = strike * 1.25;
  const maxLoss   = -premium * size;
  const maxProfit = side === 'call'
    ? (xMax - strike) * size - premium * size
    : (strike - xMin) * size - premium * size;

  const yMin = maxLoss * 1.15;
  const yMax = Math.max(maxProfit, 0) * 1.15 || premium * size * 2;

  const toX = (price: number) => PAD_L + ((price - xMin) / (xMax - xMin)) * chartW;
  const toY = (pnl: number)   => PAD_T + ((yMax - pnl) / (yMax - yMin)) * chartH;

  const zeroY     = toY(0);
  const bePrice   = side === 'call' ? strike + premium : strike - premium;
  const beX       = toX(bePrice);
  const strikeX   = toX(strike);
  const spotX     = toX(currentSpot);
  const points    = 60;

  // Build payoff path points
  const pts: [number, number][] = [];
  for (let i = 0; i <= points; i++) {
    const price = xMin + (i / points) * (xMax - xMin);
    const payoff = side === 'call'
      ? Math.max(price - strike, 0) * size - premium * size
      : Math.max(strike - price, 0) * size - premium * size;
    pts.push([toX(price), toY(payoff)]);
  }

  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

  // Split into profit/loss fill areas
  // Loss fill (below zero)
  const lossPoints = pts.filter(([, y]) => y >= zeroY);
  const profitPoints = pts.filter(([, y]) => y <= zeroY);

  const lossFill = lossPoints.length > 1
    ? `M${lossPoints[0][0].toFixed(1)},${zeroY} ` +
      lossPoints.map((p) => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') +
      ` L${lossPoints[lossPoints.length - 1][0].toFixed(1)},${zeroY} Z`
    : '';

  const profitFill = profitPoints.length > 1
    ? `M${profitPoints[0][0].toFixed(1)},${zeroY} ` +
      profitPoints.map((p) => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') +
      ` L${profitPoints[profitPoints.length - 1][0].toFixed(1)},${zeroY} Z`
    : '';

  const curveColor = side === 'call' ? 'var(--green)' : 'var(--red)';

  // Y axis labels
  const yLabels = [yMax, yMax / 2, 0, yMin / 2, yMin].map((v) => ({ v, y: toY(v) }));

  // X axis labels
  const xLabels = [xMin, (xMin + strike) / 2, strike, (strike + xMax) / 2, xMax].map((v) => ({ v, x: toX(v) }));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }}>
      {/* Grid — zero line */}
      <line x1={PAD_L} y1={zeroY} x2={W - PAD_R} y2={zeroY} stroke="var(--border2)" strokeWidth={1} />

      {/* Loss fill */}
      {lossFill && <path d={lossFill} fill="rgba(235,54,90,0.12)" />}

      {/* Profit fill */}
      {profitFill && <path d={profitFill} fill="rgba(2,199,123,0.12)" />}

      {/* Strike vertical */}
      <line x1={strikeX} y1={PAD_T} x2={strikeX} y2={PAD_T + chartH} stroke="rgba(85,195,233,0.25)" strokeWidth={1} strokeDasharray="3 4" />

      {/* Spot vertical */}
      {spotX >= PAD_L && spotX <= W - PAD_R && (
        <line x1={spotX} y1={PAD_T} x2={spotX} y2={PAD_T + chartH} stroke="rgba(255,255,255,0.08)" strokeWidth={0.5} />
      )}

      {/* Payoff curve */}
      <path d={pathD} fill="none" stroke={curveColor} strokeWidth={1.5} />

      {/* Breakeven dot + label */}
      {beX >= PAD_L && beX <= W - PAD_R && (
        <>
          <circle cx={beX} cy={zeroY} r={3} fill="var(--amber)" />
          <text x={beX + 4} y={zeroY - 4} fill="var(--amber)" fontSize={8} fontFamily="var(--mono)">
            BE {fmtK(bePrice)}
          </text>
        </>
      )}

      {/* Y-axis labels */}
      {yLabels.map(({ v, y }) => (
        <text key={v} x={PAD_L - 3} y={y + 3} fill="var(--text3)" fontSize={7} fontFamily="var(--mono)" textAnchor="end">
          {fmtPnl(v)}
        </text>
      ))}

      {/* X-axis labels */}
      {xLabels.map(({ v, x }) => (
        <text key={v} x={x} y={H - 4} fill="var(--text3)" fontSize={7} fontFamily="var(--mono)" textAnchor="middle">
          {fmtK(v)}
        </text>
      ))}
    </svg>
  );
});
