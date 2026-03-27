'use client';
import { useState, useEffect } from 'react';
import type { OptionType, TradeFormState } from '@/types';
import { EXPIRY_OPTIONS, STRIKE_GRID_PCT } from '@/lib/constants';
import { usePriceBySymbol } from '@/hooks/usePacificaPrice';

interface Props {
  value: TradeFormState;
  onChange: (v: TradeFormState) => void;
}

export function OptionSelector({ value, onChange }: Props) {
  const { price: spotPrice } = usePriceBySymbol(value.market);

  // Compute expiry date from days offset
  function expiryFromDays(days: number): Date {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(8, 0, 0, 0); // 08:00 UTC
    return d;
  }

  // Compute strike price from percentage of spot
  function strikeFromPct(pct: number): number {
    return spotPrice > 0 ? Math.round((spotPrice * pct) / 100) : 0;
  }

  // Auto-update strike when market / spot changes (keep ATM)
  useEffect(() => {
    if (spotPrice > 0 && value.strike === 0) {
      onChange({ ...value, strike: Math.round(spotPrice) });
    }
  }, [spotPrice, value.market]);

  const selectedExpiryDays =
    Math.round((value.expiry.getTime() - Date.now()) / 86400000) || 7;

  return (
    <div className="space-y-5">
      {/* Selected market badge */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 uppercase tracking-wider">Market</span>
        <span className="px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/40 text-cyan-300 text-sm font-semibold">
          {value.market}
        </span>
        {spotPrice > 0 && (
          <span className="text-xs text-gray-500 font-mono">
            ${spotPrice.toLocaleString('en-US', { maximumFractionDigits: value.market === 'SOL' ? 2 : 0 })}
          </span>
        )}
      </div>

      {/* Call / Put toggle */}
      <div>
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 block">
          Type
        </label>
        <div className="flex gap-2">
          {(['Call', 'Put'] as OptionType[]).map((t) => (
            <button
              key={t}
              onClick={() => onChange({ ...value, optionType: t })}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors border ${
                value.optionType === t
                  ? t === 'Call'
                    ? 'bg-green-500/10 border-green-500/50 text-green-400'
                    : 'bg-purple-500/10 border-purple-500/50 text-purple-400'
                  : 'bg-[#0f0f18] border-[#1a1a2e] text-gray-400 hover:border-[#2a2a4a] hover:text-gray-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Expiry */}
      <div>
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 block">
          Expiry
        </label>
        <div className="flex gap-1.5 flex-wrap">
          {EXPIRY_OPTIONS.map(({ label, days }) => (
            <button
              key={label}
              onClick={() => onChange({ ...value, expiry: expiryFromDays(days) })}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                selectedExpiryDays === days
                  ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400'
                  : 'bg-[#0f0f18] border-[#1a1a2e] text-gray-400 hover:border-[#2a2a4a]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-gray-600">
          Expires: {value.expiry.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} 08:00 UTC
        </p>
      </div>

      {/* Strike */}
      <div>
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 block">
          Strike
          {spotPrice > 0 && (
            <span className="ml-2 normal-case font-normal text-gray-600">
              (Spot: ${spotPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })})
            </span>
          )}
        </label>

        {/* Strike grid */}
        <div className="grid grid-cols-4 gap-1.5 mb-3">
          {STRIKE_GRID_PCT.map((pct) => {
            const stk = strikeFromPct(pct);
            const isAtm = pct === 100;
            const isSelected = stk > 0 && value.strike === stk;
            const moneyness =
              pct < 100
                ? value.optionType === 'Call' ? 'OTM' : 'ITM'
                : pct > 100
                ? value.optionType === 'Call' ? 'ITM' : 'OTM'
                : 'ATM';

            return (
              <button
                key={pct}
                disabled={stk === 0}
                onClick={() => onChange({ ...value, strike: stk })}
                className={`py-1.5 rounded text-xs transition-colors border relative ${
                  isSelected
                    ? 'bg-cyan-500/15 border-cyan-500/60 text-cyan-300'
                    : isAtm
                    ? 'bg-[#141420] border-[#2a2a4a] text-gray-300 hover:border-cyan-500/40'
                    : 'bg-[#0f0f18] border-[#1a1a2e] text-gray-500 hover:border-[#2a2a4a] hover:text-gray-300'
                } disabled:opacity-30 disabled:cursor-not-allowed`}
              >
                <div className="font-mono">
                  {stk > 0
                    ? stk >= 1000
                      ? `$${(stk / 1000).toFixed(0)}k`
                      : `$${stk}`
                    : '—'}
                </div>
                <div className={`text-[9px] mt-0.5 ${
                  moneyness === 'ATM' ? 'text-cyan-500' :
                  moneyness === 'ITM' ? 'text-green-500' : 'text-gray-600'
                }`}>
                  {isAtm ? 'ATM' : `${pct}%`}
                </div>
              </button>
            );
          })}
        </div>

        {/* Custom strike input */}
        <div className="flex gap-2 items-center">
          <span className="text-xs text-gray-500">Custom:</span>
          <input
            type="number"
            value={value.strike || ''}
            onChange={(e) => onChange({ ...value, strike: Number(e.target.value) })}
            placeholder="Enter strike price"
            className="input-field flex-1 text-xs"
            min={1}
          />
        </div>
      </div>

      {/* Size */}
      <div>
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 block">
          Size ({value.market})
        </label>
        <div className="flex gap-2 mb-2">
          {[0.1, 0.25, 0.5, 1].map((s) => (
            <button
              key={s}
              onClick={() => onChange({ ...value, size: s })}
              className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${
                value.size === s
                  ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400'
                  : 'bg-[#0f0f18] border-[#1a1a2e] text-gray-400 hover:border-[#2a2a4a]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <input
          type="number"
          value={value.size}
          onChange={(e) => onChange({ ...value, size: Number(e.target.value) })}
          step="0.01"
          min="0.01"
          className="input-field text-sm"
        />
        {spotPrice > 0 && value.size > 0 && (
          <p className="mt-1 text-xs text-gray-600">
            ≈ ${(value.size * spotPrice).toLocaleString('en-US', { maximumFractionDigits: 0 })} notional
          </p>
        )}
      </div>

      {/* Slippage */}
      <div>
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 block">
          Max Slippage
        </label>
        <div className="flex gap-1.5">
          {[50, 100, 200].map((bps) => (
            <button
              key={bps}
              onClick={() => onChange({ ...value, slippageBps: bps })}
              className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${
                value.slippageBps === bps
                  ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400'
                  : 'bg-[#0f0f18] border-[#1a1a2e] text-gray-400 hover:border-[#2a2a4a]'
              }`}
            >
              {bps / 100}%
            </button>
          ))}
          <input
            type="number"
            value={value.slippageBps / 100}
            onChange={(e) => onChange({ ...value, slippageBps: Math.round(Number(e.target.value) * 100) })}
            step="0.1"
            min="0.1"
            max="10"
            className="input-field w-16 text-xs text-center"
          />
        </div>
      </div>
    </div>
  );
}
