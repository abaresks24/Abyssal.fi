import type { Candle } from '@/types';

// ── Moving Averages ────────────────────────────────────────────────────────

export function sma(closes: number[], p: number): (number | null)[] {
  return closes.map((_, i) =>
    i < p - 1 ? null
      : closes.slice(i - p + 1, i + 1).reduce((a, b) => a + b, 0) / p,
  );
}

export function ema(closes: number[], p: number): (number | null)[] {
  const k = 2 / (p + 1);
  const out: (number | null)[] = new Array(closes.length).fill(null);
  let prev: number | null = null;
  for (let i = 0; i < closes.length; i++) {
    if (i < p - 1) continue;
    if (prev === null) {
      prev = closes.slice(0, p).reduce((a, b) => a + b, 0) / p;
    } else {
      prev = closes[i] * k + prev * (1 - k);
    }
    out[i] = prev;
  }
  return out;
}

// ── Bollinger Bands ────────────────────────────────────────────────────────

export function bollingerBands(closes: number[], p = 20, mult = 2) {
  const mid = sma(closes, p);
  return closes.map((_, i) => {
    if (mid[i] === null) return { upper: null as null, mid: null as null, lower: null as null };
    const sl   = closes.slice(i - p + 1, i + 1);
    const mean = mid[i]!;
    const std  = Math.sqrt(sl.reduce((a, v) => a + (v - mean) ** 2, 0) / p);
    return { upper: mean + mult * std, mid: mean, lower: mean - mult * std };
  });
}

// ── RSI ────────────────────────────────────────────────────────────────────

export function rsi(closes: number[], p = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= p) return out;
  let ag = 0, al = 0;
  for (let i = 1; i <= p; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) ag += d; else al -= d;
  }
  ag /= p; al /= p;
  out[p] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  for (let i = p + 1; i < closes.length; i++) {
    const d  = closes[i] - closes[i - 1];
    const g  = d > 0 ? d : 0;
    const l  = d < 0 ? -d : 0;
    ag = (ag * (p - 1) + g) / p;
    al = (al * (p - 1) + l) / p;
    out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return out;
}

// ── MACD ───────────────────────────────────────────────────────────────────

export function macd(closes: number[], fast = 12, slow = 26, sig = 9) {
  const ef = ema(closes, fast);
  const es = ema(closes, slow);
  const macdLine = closes.map((_, i) =>
    ef[i] != null && es[i] != null ? ef[i]! - es[i]! : null,
  );
  // Signal = EMA(macd, sig)
  const vals     = macdLine.filter((v): v is number => v !== null);
  const sigVals  = ema(vals, sig);
  let si = 0;
  const signalLine = macdLine.map(v => (v !== null ? (sigVals[si++] ?? null) : null));
  const hist       = macdLine.map((m, i) =>
    m !== null && signalLine[i] !== null ? m - signalLine[i]! : null,
  );
  return { macdLine, signalLine, hist };
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Convert indicators array to LWC {time, value} format */
export function toLWCSeries(
  candles: Candle[],
  values: (number | null)[],
): { time: number; value: number }[] {
  return candles
    .map((c, i) => ({ time: Math.floor(c.timestamp / 1000) as unknown as number, value: values[i]! }))
    .filter(d => d.value != null);
}
