'use client';
import { useState } from 'react';
import type { LPPosition, Market } from '@/types';

interface PoolStats {
  market: Market;
  optionType: 'Call' | 'Put';
  strike: number;
  expiry: Date;
  tvl: number;
  utilization: number;
  apy: number;
  volume24h: number;
}

const MOCK_POOLS: PoolStats[] = [
  {
    market: 'BTC',
    optionType: 'Call',
    strike: 100000,
    expiry: new Date(Date.now() + 7 * 86400000),
    tvl: 450000,
    utilization: 0.62,
    apy: 18.4,
    volume24h: 32000,
  },
  {
    market: 'BTC',
    optionType: 'Put',
    strike: 90000,
    expiry: new Date(Date.now() + 7 * 86400000),
    tvl: 280000,
    utilization: 0.45,
    apy: 14.2,
    volume24h: 18000,
  },
  {
    market: 'ETH',
    optionType: 'Call',
    strike: 3500,
    expiry: new Date(Date.now() + 7 * 86400000),
    tvl: 190000,
    utilization: 0.71,
    apy: 22.1,
    volume24h: 12000,
  },
  {
    market: 'SOL',
    optionType: 'Call',
    strike: 200,
    expiry: new Date(Date.now() + 14 * 86400000),
    tvl: 85000,
    utilization: 0.38,
    apy: 11.7,
    volume24h: 4500,
  },
];

function UtilBar({ value }: { value: number }) {
  const pct = value * 100;
  const color = pct > 80 ? 'bg-red-500' : pct > 60 ? 'bg-yellow-500' : 'bg-cyan-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-[#1a1a2e] rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-gray-400 w-8 text-right">{pct.toFixed(0)}%</span>
    </div>
  );
}

interface DepositModalProps {
  pool: PoolStats;
  onClose: () => void;
}

function DepositModal({ pool, onClose }: DepositModalProps) {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);

  const handleDeposit = async () => {
    if (!amount || parseFloat(amount) <= 0) return;
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1500)); // Simulate tx
    setLoading(false);
    onClose();
  };

  const estApy = pool.apy;
  const yearlyEarnings = amount ? (parseFloat(amount) * estApy) / 100 : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0a0a0f] border border-[#1a1a2e] rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-gray-200">
            Add Liquidity — {pool.market} {pool.optionType}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">×</button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-xs bg-[#0f0f18] border border-[#1a1a2e] rounded-xl p-4">
            <div>
              <div className="text-gray-600">Strike</div>
              <div className="font-mono text-gray-300 mt-0.5">${pool.strike.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-gray-600">Expiry</div>
              <div className="font-mono text-gray-300 mt-0.5">
                {pool.expiry.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
            </div>
            <div>
              <div className="text-gray-600">Est. APY</div>
              <div className="font-mono text-green-400 mt-0.5">{estApy.toFixed(1)}%</div>
            </div>
            <div>
              <div className="text-gray-600">Utilization</div>
              <div className="font-mono text-gray-300 mt-0.5">{(pool.utilization * 100).toFixed(0)}%</div>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 block">
              USDC Amount
            </label>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="input-field pr-16"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">USDC</span>
            </div>
          </div>

          {amount && parseFloat(amount) > 0 && (
            <div className="bg-[#0f0f18] border border-[#1a1a2e] rounded-xl p-3 text-xs space-y-1.5">
              <div className="flex justify-between text-gray-500">
                <span>Est. annual earnings</span>
                <span className="text-green-400 font-mono">+${yearlyEarnings.toFixed(2)} USDC</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>LP tokens received</span>
                <span className="font-mono text-gray-300">{parseFloat(amount).toFixed(6)}</span>
              </div>
              <div className="text-gray-600 pt-1 border-t border-[#1a1a2e]">
                As LP, you earn trading fees + theta decay from options sold by the AMM.
                Risk: delta exposure if market moves significantly.
              </div>
            </div>
          )}

          <button
            onClick={handleDeposit}
            disabled={!amount || parseFloat(amount) <= 0 || loading}
            className="btn-primary w-full py-3 text-sm"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Depositing…
              </span>
            ) : (
              `Deposit ${amount || '0'} USDC`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

interface Props {
  userPositions?: LPPosition[];
}

export function LiquidityPanel({ userPositions = [] }: Props) {
  const [selectedPool, setSelectedPool] = useState<PoolStats | null>(null);

  const totalTvl = MOCK_POOLS.reduce((s, p) => s + p.tvl, 0);
  const avgApy = MOCK_POOLS.reduce((s, p) => s + p.apy, 0) / MOCK_POOLS.length;

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total TVL', value: `$${(totalTvl / 1000).toFixed(0)}K`, sub: 'USDC' },
          { label: 'Avg APY', value: `${avgApy.toFixed(1)}%`, sub: 'fees + theta' },
          { label: 'Active pools', value: `${MOCK_POOLS.length}`, sub: 'across markets' },
        ].map(({ label, value, sub }) => (
          <div key={label} className="bg-[#0a0a0f] border border-[#1a1a2e] rounded-xl p-3 text-center">
            <div className="text-lg font-mono font-semibold text-cyan-400">{value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{label}</div>
            <div className="text-xs text-gray-700">{sub}</div>
          </div>
        ))}
      </div>

      {/* Pool table */}
      <div className="bg-[#0a0a0f] border border-[#1a1a2e] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1a1a2e]">
          <span className="text-sm font-semibold text-gray-300">Available Pools</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1a1a2e]">
              {['Pool', 'Strike', 'Expiry', 'TVL', 'Utilization', 'APY', ''].map((h) => (
                <th key={h} className="text-left px-4 py-2 text-xs text-gray-600 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOCK_POOLS.map((pool, i) => (
              <tr
                key={i}
                className="border-b border-[#141414] hover:bg-[#0f0f18] transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className={pool.optionType === 'Call' ? 'badge-call' : 'badge-put'}>
                      {pool.optionType}
                    </span>
                    <span className="font-medium text-gray-200">{pool.market}</span>
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-gray-300">
                  ${pool.strike.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {pool.expiry.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </td>
                <td className="px-4 py-3 font-mono text-gray-300">
                  ${(pool.tvl / 1000).toFixed(0)}K
                </td>
                <td className="px-4 py-3 min-w-[120px]">
                  <UtilBar value={pool.utilization} />
                </td>
                <td className="px-4 py-3 font-mono text-green-400">
                  {pool.apy.toFixed(1)}%
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => setSelectedPool(pool)}
                    className="btn-secondary text-xs py-1 px-3"
                  >
                    Deposit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* User LP positions */}
      {userPositions.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            Your LP Positions
          </div>
          {userPositions.map((pos) => (
            <div
              key={pos.pubkey}
              className="bg-[#0a0a0f] border border-[#1a1a2e] rounded-xl p-4 flex items-center justify-between"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className={pos.optionType === 'Call' ? 'badge-call' : 'badge-put'}>
                    {pos.optionType}
                  </span>
                  <span className="font-medium text-gray-200">{pos.market}</span>
                  <span className="text-gray-500 text-sm font-mono">${pos.strike.toLocaleString()}</span>
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  Deposited: <span className="font-mono text-gray-400">${pos.usdcDeposited.toFixed(2)} USDC</span>
                  {' · '}{pos.lpTokens.toFixed(6)} LP tokens
                </div>
              </div>
              <div className="text-right">
                <div className={`font-mono text-sm ${
                  (pos.pnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {(pos.pnl ?? 0) >= 0 ? '+' : ''}${(pos.pnl ?? 0).toFixed(2)}
                </div>
                <button className="btn-secondary text-xs py-1 px-3 mt-1">
                  Withdraw
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedPool && (
        <DepositModal pool={selectedPool} onClose={() => setSelectedPool(null)} />
      )}
    </div>
  );
}
