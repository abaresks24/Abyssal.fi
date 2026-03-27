'use client';
import type { TradeFormState } from '@/types';
import { useGreeks } from '@/hooks/useGreeks';
import { usePriceBySymbol } from '@/hooks/usePacificaPrice';
import { PLATFORM_FEE_BPS } from '@/lib/constants';

const ATM_IV_BY_MARKET: Record<string, number> = {
  // Crypto
  BTC: 0.65, ETH: 0.75, SOL: 0.90,
  // Equities
  NVDA: 0.40, TSLA: 0.60, PLTR: 0.65, CRCL: 0.55, HOOD: 0.70, SP500: 0.15,
  // Commodities
  XAU: 0.12, XAG: 0.18, PAXG: 0.12, PLATINUM: 0.20, NATGAS: 0.65, COPPER: 0.25,
};

interface Props {
  form: TradeFormState;
  onBuy: () => void;
  loading?: boolean;
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[#1a1a2e] last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <div className="text-right">
        <span className="text-sm font-mono text-gray-200">{value}</span>
        {sub && <div className="text-xs text-gray-600">{sub}</div>}
      </div>
    </div>
  );
}

export function PriceQuote({ form, onBuy, loading }: Props) {
  const { price: spot } = usePriceBySymbol(form.market);
  const iv = ATM_IV_BY_MARKET[form.market] ?? 0.7;

  const expiryTs = form.expiry.getTime() / 1000;

  const { price, totalPremium, fee, totalWithFee, greeks, T, isExpired } = useGreeks({
    optionType: form.optionType,
    spot,
    strike: form.strike,
    iv,
    expiryTs,
    size: form.size,
  });

  const isItm =
    form.optionType === 'Call'
      ? form.strike < spot
      : form.strike > spot;

  const moneynessPct = spot > 0 ? ((form.strike / spot - 1) * 100) : 0;

  const daysToExpiry = Math.max(T * 365.25, 0);
  const canBuy = !isExpired && spot > 0 && form.strike > 0 && form.size > 0 && totalWithFee > 0;

  return (
    <div className="space-y-4">
      {/* Quote breakdown */}
      <div className="bg-[#0a0a0f] border border-[#1a1a2e] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={form.optionType === 'Call' ? 'badge-call' : 'badge-put'}>
              {form.optionType}
            </span>
            <span className={isItm ? 'badge-itm' : 'badge-otm'}>
              {Math.abs(moneynessPct) < 0.5 ? 'ATM' : isItm ? 'ITM' : 'OTM'}
            </span>
          </div>
          <span className="text-xs text-gray-500 font-mono">
            IV: {(iv * 100).toFixed(0)}%
          </span>
        </div>

        <Row
          label="Option price (per unit)"
          value={spot > 0 ? `$${price.toFixed(4)}` : '—'}
          sub={`${form.market} ${form.optionType}`}
        />
        <Row
          label="Size"
          value={`${form.size} ${form.market}`}
          sub={spot > 0 ? `≈ $${(form.size * spot).toLocaleString('en-US', { maximumFractionDigits: 0 })} notional` : undefined}
        />
        <Row
          label="Strike"
          value={form.strike > 0 ? `$${form.strike.toLocaleString('en-US')}` : '—'}
          sub={moneynessPct !== 0 ? `${moneynessPct > 0 ? '+' : ''}${moneynessPct.toFixed(1)}% vs spot` : undefined}
        />
        <Row
          label="Expiry"
          value={form.expiry.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          sub={`${daysToExpiry.toFixed(1)} days`}
        />
        <Row
          label="Subtotal premium"
          value={spot > 0 ? `$${totalPremium.toFixed(4)}` : '—'}
        />
        <Row
          label={`Platform fee (${PLATFORM_FEE_BPS / 100}%)`}
          value={spot > 0 ? `$${fee.toFixed(4)}` : '—'}
        />
      </div>

      {/* Total */}
      <div className="bg-gradient-to-r from-cyan-500/5 to-purple-500/5 border border-cyan-500/20 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-300">Total to pay</span>
          <div className="text-right">
            <div className="text-xl font-mono font-bold text-cyan-400">
              {spot > 0 ? `$${totalWithFee.toFixed(4)}` : '—'}
            </div>
            <div className="text-xs text-gray-600">USDC</div>
          </div>
        </div>

        {spot > 0 && totalWithFee > 0 && (
          <div className="mt-2 text-xs text-gray-600">
            Max loss: <span className="text-gray-400 font-mono">${totalWithFee.toFixed(4)}</span>
            {' · '}
            Max profit:{' '}
            <span className="text-green-400 font-mono">
              {form.optionType === 'Call'
                ? 'Unlimited'
                : `$${((form.strike - (spot > form.strike ? form.strike : spot)) * form.size).toFixed(2)}`}
            </span>
          </div>
        )}
      </div>

      {/* Greeks summary */}
      {spot > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Δ Delta', value: greeks.delta.toFixed(3), color: 'text-cyan-400' },
            { label: 'Γ Gamma', value: greeks.gamma.toFixed(5), color: 'text-purple-400' },
            { label: 'Θ Theta', value: `$${Math.abs(greeks.theta).toFixed(4)}/d`, color: 'text-red-400' },
            { label: 'ν Vega', value: `$${greeks.vega.toFixed(4)}/%`, color: 'text-yellow-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-[#0a0a0f] border border-[#1a1a2e] rounded-lg p-2 text-center">
              <div className={`text-xs ${color} font-mono font-medium`}>{value}</div>
              <div className="text-[10px] text-gray-600 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Buy button */}
      <button
        onClick={onBuy}
        disabled={!canBuy || loading}
        className="w-full py-3 rounded-xl font-semibold text-sm
                   bg-gradient-to-r from-cyan-500 to-purple-600
                   text-white hover:opacity-90 active:opacity-80
                   disabled:opacity-40 disabled:cursor-not-allowed
                   transition-opacity"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Confirming…
          </span>
        ) : !spot ? (
          'Loading price…'
        ) : isExpired ? (
          'Option expired'
        ) : !canBuy ? (
          'Fill in all fields'
        ) : (
          `Buy ${form.optionType} · Pay $${totalWithFee.toFixed(2)} USDC`
        )}
      </button>

      <p className="text-xs text-center text-gray-600">
        European-style · Settlement via Pacifica TWAP-1h · 0.05% fee
      </p>
    </div>
  );
}
