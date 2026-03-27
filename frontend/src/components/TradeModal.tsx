'use client';
import { useState } from 'react';
import type { TradeFormState, Position } from '@/types';
import { useGreeks } from '@/hooks/useGreeks';
import { usePriceBySymbol } from '@/hooks/usePacificaPrice';
import { PLATFORM_FEE_BPS } from '@/lib/constants';

// Fallback IV estimates used only when oracle value is not yet available
const IV_FALLBACK: Record<string, number> = { BTC: 0.65, ETH: 0.75, SOL: 0.90 };

interface Props {
  form: TradeFormState;
  /** Live ATM IV from on-chain oracle (decimal, e.g. 0.65 = 65%). Falls back to estimate. */
  iv?: number;
  onClose: () => void;
  onConfirm: (form: TradeFormState) => Promise<string>;
}

type Step = 'review' | 'sign' | 'success' | 'error';

export function TradeModal({ form, iv: ivProp, onClose, onConfirm }: Props) {
  const [step, setStep] = useState<Step>('review');
  const [txSig, setTxSig] = useState('');
  const [error, setError] = useState('');

  const { price: spot } = usePriceBySymbol(form.market);
  const iv = ivProp ?? IV_FALLBACK[form.market] ?? 0.7;
  const expiryTs = form.expiry.getTime() / 1000;

  const { totalWithFee, fee, greeks, T } = useGreeks({
    optionType: form.optionType,
    spot,
    strike: form.strike,
    iv,
    expiryTs,
    size: form.size,
  });

  const handleConfirm = async () => {
    setStep('sign');
    try {
      const sig = await onConfirm(form);
      setTxSig(sig);
      setStep('success');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Transaction failed';
      setError(message);
      setStep('error');
    }
  };

  const daysLeft = (T * 365.25).toFixed(1);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0a0a0f] border border-[#1a1a2e] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#1a1a2e] flex items-center justify-between">
          <h2 className="font-semibold text-gray-200">
            {step === 'review' ? 'Confirm Trade' :
             step === 'sign' ? 'Signing Transaction' :
             step === 'success' ? 'Transaction Sent' : 'Transaction Failed'}
          </h2>
          {step !== 'sign' && (
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">×</button>
          )}
        </div>

        <div className="p-6">
          {step === 'review' && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="bg-[#0f0f18] border border-[#1a1a2e] rounded-xl p-4 space-y-0">
                {[
                  ['Action', `Buy ${form.optionType}`, form.optionType === 'Call' ? 'text-green-400' : 'text-purple-400'],
                  ['Market', `${form.market}-PERP`, 'text-gray-200'],
                  ['Strike', `$${form.strike.toLocaleString('en-US')}`, 'text-gray-200'],
                  ['Expiry', `${form.expiry.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} (${daysLeft}d)`, 'text-gray-200'],
                  ['Size', `${form.size} ${form.market}`, 'text-gray-200'],
                  ['Option price', spot > 0 ? `$${(totalWithFee / form.size).toFixed(4)}` : '—', 'text-gray-200'],
                  [`Fee (${PLATFORM_FEE_BPS / 100}%)`, spot > 0 ? `$${fee.toFixed(4)}` : '—', 'text-gray-500'],
                ].map(([label, value, valueClass]) => (
                  <div key={label} className="flex justify-between py-2 border-b border-[#1a1a2e] last:border-0">
                    <span className="text-xs text-gray-500">{label}</span>
                    <span className={`text-xs font-mono ${valueClass}`}>{value}</span>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="flex items-center justify-between bg-gradient-to-r from-cyan-500/5 to-purple-500/5 border border-cyan-500/20 rounded-xl px-4 py-3">
                <span className="text-sm font-medium text-gray-300">Total debit</span>
                <span className="text-xl font-mono font-bold text-cyan-400">
                  ${totalWithFee.toFixed(4)} USDC
                </span>
              </div>

              {/* Greeks */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { g: 'Δ', v: greeks.delta.toFixed(3), c: 'text-cyan-400' },
                  { g: 'Γ', v: greeks.gamma.toFixed(5), c: 'text-purple-400' },
                  { g: 'Θ', v: `${greeks.theta.toFixed(4)}/d`, c: 'text-red-400' },
                  { g: 'ν', v: `${greeks.vega.toFixed(4)}/%`, c: 'text-yellow-400' },
                ].map(({ g, v, c }) => (
                  <div key={g} className="bg-[#0f0f18] border border-[#1a1a2e] rounded-lg p-2 text-center">
                    <div className={`text-sm font-mono ${c}`}>{v}</div>
                    <div className="text-[10px] text-gray-600 mt-0.5">{g}</div>
                  </div>
                ))}
              </div>

              {/* Warning */}
              <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3 text-xs text-yellow-600">
                European-style: can only be exercised at expiry. Max loss = premium paid.
                Settlement via Pacifica TWAP-1h oracle.
              </div>

              {/* CTA */}
              <button onClick={handleConfirm} className="btn-primary w-full py-3 text-sm">
                Confirm & Sign Transaction
              </button>
            </div>
          )}

          {step === 'sign' && (
            <div className="py-8 text-center space-y-4">
              <div className="w-12 h-12 mx-auto border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
              <div className="text-sm text-gray-400">Waiting for wallet signature…</div>
              <div className="text-xs text-gray-600">Please approve the transaction in your wallet</div>
            </div>
          )}

          {step === 'success' && (
            <div className="py-6 text-center space-y-4">
              <div className="w-12 h-12 mx-auto rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center text-2xl">
                ✓
              </div>
              <div>
                <div className="text-base font-semibold text-green-400">Option purchased!</div>
                <div className="text-sm text-gray-500 mt-1">
                  {form.optionType} · ${form.strike.toLocaleString()} · {daysLeft}d
                </div>
              </div>
              {txSig && (
                <a
                  href={`https://solscan.io/tx/${txSig}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-xs text-cyan-400 hover:text-cyan-300 underline"
                >
                  View on Solscan →
                </a>
              )}
              <button onClick={onClose} className="btn-secondary w-full">
                Close
              </button>
            </div>
          )}

          {step === 'error' && (
            <div className="py-6 text-center space-y-4">
              <div className="w-12 h-12 mx-auto rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-2xl">
                ✕
              </div>
              <div>
                <div className="text-base font-semibold text-red-400">Transaction failed</div>
                <div className="text-xs text-gray-500 mt-1 font-mono break-all">{error}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep('review')} className="btn-secondary flex-1">
                  Try again
                </button>
                <button onClick={onClose} className="btn-secondary flex-1">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
