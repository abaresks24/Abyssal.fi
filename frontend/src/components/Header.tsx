'use client';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

export type AppTab = 'trade' | 'positions' | 'liquidity' | 'analytics';

const TABS: { id: AppTab; label: string }[] = [
  { id: 'trade',     label: 'Trade' },
  { id: 'positions', label: 'Positions' },
  { id: 'liquidity', label: 'Liquidity' },
  { id: 'analytics', label: 'Analytics' },
];

interface Props {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  positionCount?: number;
}

export function Header({ activeTab, onTabChange, positionCount = 0 }: Props) {
  return (
    <header className="sticky top-0 z-40 border-b border-[#1a1a2e] bg-black/80 backdrop-blur-md">
      <div className="max-w-[1600px] mx-auto px-4 h-14 flex items-center justify-between gap-4">

        {/* Logo */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold">A</span>
          </div>
          <span className="text-base font-semibold text-white">
            Abyssal<span className="text-cyan-400">.fi</span>
          </span>
          <span className="hidden sm:inline text-xs px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium">
            DEVNET
          </span>
        </div>

        {/* Nav tabs */}
        <nav className="flex items-center gap-1">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={`relative px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === id
                  ? 'bg-[#141420] text-cyan-400'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {label}
              {id === 'positions' && positionCount > 0 && (
                <span className="ml-1.5 text-[10px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded-full">
                  {positionCount}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Fees + wallet */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span>Fees: 0.05%</span>
          </div>
          <WalletMultiButton />
        </div>
      </div>
    </header>
  );
}
