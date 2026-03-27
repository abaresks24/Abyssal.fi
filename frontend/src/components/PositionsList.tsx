'use client';
import { useState } from 'react';
import type { Position } from '@/types';
import { blackScholes } from '@/lib/black_scholes';
import { SECONDS_PER_YEAR } from '@/lib/constants';

interface Props {
  positions: Position[];
  onExercise?: (pos: Position) => Promise<void>;
  onClose?: (pos: Position) => Promise<void>;
  prices?: Record<string, number>;
}

function MoneynessBadge({ pos, spot }: { pos: Position; spot: number }) {
  if (!spot) return null;
  const itm =
    pos.optionType === 'Call' ? spot > pos.strike : spot < pos.strike;
  const pct = ((spot / pos.strike - 1) * 100 * (pos.optionType === 'Call' ? 1 : -1)).toFixed(1);

  if (Math.abs(parseFloat(pct)) < 0.5) {
    return <span className="badge badge-itm">ATM</span>;
  }
  return (
    <span className={`badge ${itm ? 'badge-itm' : 'badge-otm'}`}>
      {itm ? 'ITM' : 'OTM'} {pct}%
    </span>
  );
}

function PnLBadge({ pnl }: { pnl: number | undefined }) {
  if (pnl == null) return <span className="text-gray-500 text-xs">—</span>;
  const color = pnl > 0 ? 'text-green-400' : pnl < 0 ? 'text-red-400' : 'text-gray-400';
  const sign = pnl > 0 ? '+' : '';
  return (
    <span className={`font-mono text-xs ${color}`}>
      {sign}${pnl.toFixed(2)}
    </span>
  );
}

export function PositionsList({ positions, onExercise, onClose, prices = {} }: Props) {
  const [activeAction, setActiveAction] = useState<string | null>(null);

  const now = Date.now() / 1000;

  const enriched = positions.map((pos) => {
    const spot = prices[pos.market] || 0;
    const T = Math.max((pos.expiry.getTime() / 1000 - now) / SECONDS_PER_YEAR, 0);
    const isExpired = T === 0;

    let currentPremium = 0;
    if (spot > 0 && !isExpired) {
      const { price } = blackScholes(spot, pos.strike, pos.entryIv || 0.7, T, pos.optionType === 'Call');
      currentPremium = price * pos.size;
    }

    const intrinsicValue =
      pos.optionType === 'Call'
        ? Math.max(spot - pos.strike, 0) * pos.size
        : Math.max(pos.strike - spot, 0) * pos.size;

    const pnl = currentPremium > 0 ? currentPremium - pos.premiumPaid : undefined;
    const isItm = intrinsicValue > 0;

    return { ...pos, currentPremium, intrinsicValue, pnl, isExpired, isItm };
  });

  const open = enriched.filter((p) => !p.settled && !p.isExpired);
  const expired = enriched.filter((p) => !p.settled && p.isExpired);
  const settled = enriched.filter((p) => p.settled);

  if (positions.length === 0) {
    return (
      <div className="py-12 text-center text-gray-600 text-sm">
        <div className="text-3xl mb-3">📭</div>
        <div>No open positions</div>
        <div className="text-xs mt-1">Buy an option to get started</div>
      </div>
    );
  }

  const renderGroup = (title: string, items: typeof enriched, badge?: string) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{title}</span>
          {badge && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-[#1a1a2e] text-gray-400">
              {items.length}
            </span>
          )}
        </div>
        <div className="space-y-2">
          {items.map((pos) => {
            const spot = prices[pos.market] || 0;
            const daysLeft = Math.max((pos.expiry.getTime() - Date.now()) / 86400000, 0);
            const isActing = activeAction === pos.pubkey;

            return (
              <div
                key={pos.pubkey}
                className="bg-[#0a0a0f] border border-[#1a1a2e] rounded-xl p-4 hover:border-[#2a2a4a] transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Left: type + market */}
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={pos.optionType === 'Call' ? 'badge-call' : 'badge-put'}>
                      {pos.optionType}
                    </span>
                    <span className="text-sm font-semibold text-gray-200">
                      {pos.market}
                    </span>
                    <span className="text-sm text-gray-400 font-mono">
                      ${pos.strike.toLocaleString('en-US')}
                    </span>
                    <MoneynessBadge pos={pos} spot={spot} />
                  </div>

                  {/* Right: PnL */}
                  <PnLBadge pnl={pos.pnl} />
                </div>

                {/* Details row */}
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div>
                    <div className="text-gray-600">Size</div>
                    <div className="font-mono text-gray-300 mt-0.5">
                      {pos.size} {pos.market}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600">Paid</div>
                    <div className="font-mono text-gray-300 mt-0.5">
                      ${pos.premiumPaid.toFixed(4)}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600">Current value</div>
                    <div className={`font-mono mt-0.5 ${pos.currentPremium > pos.premiumPaid ? 'text-green-400' : 'text-gray-300'}`}>
                      {pos.currentPremium > 0 ? `$${pos.currentPremium.toFixed(4)}` : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600">
                      {pos.isExpired ? 'Intrinsic' : 'Expires'}
                    </div>
                    <div className="font-mono text-gray-300 mt-0.5">
                      {pos.isExpired
                        ? `$${pos.intrinsicValue.toFixed(4)}`
                        : daysLeft < 1
                        ? `${(daysLeft * 24).toFixed(1)}h`
                        : `${daysLeft.toFixed(1)}d`}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                {!pos.settled && (
                  <div className="mt-3 flex gap-2">
                    {pos.isExpired && pos.isItm && onExercise && (
                      <button
                        disabled={isActing}
                        onClick={async () => {
                          setActiveAction(pos.pubkey);
                          await onExercise(pos).finally(() => setActiveAction(null));
                        }}
                        className="btn-primary text-xs py-1.5 px-3"
                      >
                        {isActing ? 'Exercising…' : `Exercise (get $${pos.intrinsicValue.toFixed(2)})`}
                      </button>
                    )}
                    {!pos.isExpired && onClose && (
                      <button
                        disabled={isActing}
                        onClick={async () => {
                          setActiveAction(pos.pubkey);
                          await onClose(pos).finally(() => setActiveAction(null));
                        }}
                        className="btn-secondary text-xs py-1.5 px-3"
                      >
                        {isActing ? 'Closing…' : 'Close position'}
                      </button>
                    )}
                    {pos.isExpired && !pos.isItm && (
                      <span className="text-xs text-gray-600 py-1.5">
                        OTM — expired worthless
                      </span>
                    )}
                  </div>
                )}

                {pos.settled && (
                  <div className="mt-2 text-xs text-gray-600">
                    Settled · Received:{' '}
                    <span className="text-green-400 font-mono">${pos.payoffReceived.toFixed(4)}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {renderGroup('Open', open, 'open')}
      {renderGroup('Expired — Pending Exercise', expired, 'exp')}
      {renderGroup('Settled', settled, 'done')}
    </div>
  );
}
