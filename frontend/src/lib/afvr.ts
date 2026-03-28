/**
 * AFVR — Asymmetric Funding-Adjusted Volatility with Risk-reversal
 * Derives annualized IV from Pacifica's 8h funding rate history.
 */

/** 3 funding periods per day × 365 days */
const ANN_FACTOR = Math.sqrt(365 * 3 * 24);

const REFERENCE_IV: Record<string, number> = {
  BTC: 0.65,
  ETH: 0.72,
  SOL: 0.85,
};

export function computeAFVR(market: string, fundingHistory: number[]): number {
  const n = fundingHistory.length;
  if (n < 3) return REFERENCE_IV[market] ?? 0.65;

  const mean = fundingHistory.reduce((a, b) => a + b, 0) / n;
  const variance = fundingHistory.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const afvr = Math.sqrt(variance) * ANN_FACTOR;

  // Blend weight: more history → more AFVR, less reference
  const alpha = Math.min(0.7, Math.max(0.3, n / 90));
  const refIV = REFERENCE_IV[market] ?? 0.65;

  const blended = alpha * afvr + (1 - alpha) * refIV;

  // Clamp to reasonable vol range
  return Math.max(0.1, Math.min(3.0, blended));
}
