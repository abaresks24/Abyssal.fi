'use client';
import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { Header, type AppTab } from '@/components/Header';
import { OptionSelector } from '@/components/OptionSelector';
import { PriceQuote } from '@/components/PriceQuote';
import { GreeksDashboard } from '@/components/GreeksDashboard';
import { PositionsList } from '@/components/PositionsList';
import { LiquidityPanel } from '@/components/LiquidityPanel';
import { IVSurface } from '@/components/IVSurface';
import { TradeModal } from '@/components/TradeModal';
import { usePacificaPrice } from '@/hooks/usePacificaPrice';
import { usePriceBySymbol } from '@/hooks/usePacificaPrice';
import { useGreeks } from '@/hooks/useGreeks';
import { useIVOracle } from '@/hooks/useOptions';
import { PacificaOptionsClient } from '@/lib/anchor_client';
import { VAULT_AUTHORITY } from '@/lib/constants';
import type { TradeFormState, Position, Market, CryptoMarket } from '@/types';

// ── Market catalogue ─────────────────────────────────────────────────────────

type Section = 'crypto' | 'equities' | 'commodities';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'crypto',      label: 'Crypto' },
  { id: 'equities',    label: 'Equities' },
  { id: 'commodities', label: 'Commodities' },
];

const SECTION_MARKETS: Record<Section, string[]> = {
  crypto:      ['BTC', 'ETH', 'SOL'],
  equities:    ['NVDA', 'TSLA', 'PLTR', 'CRCL', 'HOOD', 'SP500'],
  commodities: ['XAU', 'XAG', 'PAXG', 'PLATINUM', 'NATGAS', 'COPPER'],
};

const DISPLAY_NAMES: Record<string, string> = {
  BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana',
  NVDA: 'Nvidia', TSLA: 'Tesla', PLTR: 'Palantir',
  CRCL: 'Circle', HOOD: 'Robinhood', SP500: 'S&P 500',
  XAU: 'Gold', XAG: 'Silver', PAXG: 'PAX Gold',
  PLATINUM: 'Platinum', NATGAS: 'Nat Gas', COPPER: 'Copper',
};

const CRYPTO_MARKETS: CryptoMarket[] = ['BTC', 'ETH', 'SOL'];

// ── Default trade form ───────────────────────────────────────────────────────

const DEFAULT_FORM: TradeFormState = {
  market: 'BTC',
  optionType: 'Call',
  strike: 0,
  expiry: (() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    d.setHours(8, 0, 0, 0);
    return d;
  })(),
  size: 0.1,
  slippageBps: 100,
  action: 'buy',
};

// ── Market card ──────────────────────────────────────────────────────────────

function MarketCard({
  symbol,
  selected,
  onClick,
  tradeable,
}: {
  symbol: string;
  selected: boolean;
  onClick: () => void;
  tradeable: boolean;
}) {
  const { price, change24h, direction } = usePriceBySymbol(symbol);
  const decimals = price > 1000 ? 0 : price > 10 ? 2 : price > 1 ? 3 : 4;

  return (
    <button
      onClick={onClick}
      className={`relative text-left p-4 rounded-xl border transition-all ${
        selected
          ? 'bg-cyan-500/10 border-cyan-500/50'
          : 'bg-[#0a0a0f] border-[#1a1a2e] hover:border-[#2a2a4a]'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-white">{symbol}</span>
        {!tradeable && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 border border-gray-700">
            PERP
          </span>
        )}
        {tradeable && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            OPTIONS
          </span>
        )}
      </div>
      <div className="text-xs text-gray-500 mb-2">{DISPLAY_NAMES[symbol] ?? symbol}</div>
      <div className={`text-base font-mono font-semibold transition-colors ${
        direction === 'up' ? 'text-green-400' : direction === 'down' ? 'text-red-400' : 'text-gray-200'
      }`}>
        {price > 0
          ? `$${price.toLocaleString('en-US', { maximumFractionDigits: decimals })}`
          : <span className="text-gray-600">—</span>}
      </div>
      {price > 0 && change24h !== 0 && (
        <div className={`text-xs mt-0.5 ${change24h > 0 ? 'text-green-400' : 'text-red-400'}`}>
          {change24h > 0 ? '+' : ''}{change24h.toFixed(2)}%
        </div>
      )}
    </button>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [activeTab, setActiveTab]       = useState<AppTab>('trade');
  const [activeSection, setActiveSection] = useState<Section>('crypto');
  const [form, setForm]                 = useState<TradeFormState>(DEFAULT_FORM);
  const [showModal, setShowModal]       = useState(false);
  const [positions, setPositions]       = useState<Position[]>([]);

  const wallet = useWallet();
  // Keep crypto WS subscription alive for PositionsList prices record
  const { prices } = usePacificaPrice(CRYPTO_MARKETS);
  const ivOracle = useIVOracle();
  // Use per-symbol hook so any market (equity, commodity) gets a live price
  const { price: spotPrice } = usePriceBySymbol(form.market);
  const spot = spotPrice || 0;
  const iv   = ivOracle[form.market] ?? 0.7;

  const { greeks, totalWithFee } = useGreeks({
    optionType: form.optionType,
    spot,
    strike:    form.strike,
    iv,
    expiryTs:  form.expiry.getTime() / 1000,
    size:      form.size,
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleConfirmTrade = async (tradeForm: TradeFormState): Promise<string> => {
    if (!wallet.publicKey) throw new Error('Wallet not connected');
    if (!VAULT_AUTHORITY)  throw new Error('NEXT_PUBLIC_VAULT_AUTHORITY not configured');

    const client = new PacificaOptionsClient(wallet);
    const maxPremium = totalWithFee * (1 + tradeForm.slippageBps / 10_000);

    const txSig = await client.buyOption({
      vaultAuthority:  new PublicKey(VAULT_AUTHORITY),
      market:          tradeForm.market,
      optionType:      tradeForm.optionType,
      strikeUsdc:      tradeForm.strike,
      expiry:          Math.floor(tradeForm.expiry.getTime() / 1000),
      sizeUnderlying:  tradeForm.size,
      maxPremiumUsdc:  maxPremium,
    });

    setPositions((prev) => [{
      pubkey:        txSig,
      owner:         wallet.publicKey!.toBase58(),
      market:        tradeForm.market,
      optionType:    tradeForm.optionType,
      strike:        tradeForm.strike,
      expiry:        tradeForm.expiry,
      size:          tradeForm.size,
      premiumPaid:   totalWithFee,
      entryIv:       iv,
      entryDelta:    greeks.delta,
      settled:       false,
      payoffReceived: 0,
      createdAt:     new Date(),
      status:        'open',
    }, ...prev]);

    return txSig;
  };

  const handleExercise = async (pos: Position) => {
    if (!wallet.publicKey) throw new Error('Wallet not connected');
    if (!VAULT_AUTHORITY)  throw new Error('NEXT_PUBLIC_VAULT_AUTHORITY not configured');
    const client = new PacificaOptionsClient(wallet);
    await client.exerciseOption({
      vaultAuthority: new PublicKey(VAULT_AUTHORITY),
      market:         pos.market,
      optionType:     pos.optionType,
      strikeUsdc:     pos.strike,
      expiry:         Math.floor(pos.expiry.getTime() / 1000),
    });
    setPositions((prev) =>
      prev.map((p) =>
        p.pubkey === pos.pubkey ? { ...p, settled: true, status: 'exercised' as const } : p
      )
    );
  };

  const handleClose = async (pos: Position) => {
    if (!wallet.publicKey) throw new Error('Wallet not connected');
    if (!VAULT_AUTHORITY)  throw new Error('NEXT_PUBLIC_VAULT_AUTHORITY not configured');
    const client = new PacificaOptionsClient(wallet);
    await client.sellOption({
      vaultAuthority:  new PublicKey(VAULT_AUTHORITY),
      market:          pos.market,
      optionType:      pos.optionType,
      strikeUsdc:      pos.strike,
      expiry:          Math.floor(pos.expiry.getTime() / 1000),
      sizeUnderlying:  pos.size,
      minProceedsUsdc: 0,
    });
    setPositions((prev) => prev.filter((p) => p.pubkey !== pos.pubkey));
  };

  const openCount = positions.filter((p) => !p.settled).length;

  // ── Section content ────────────────────────────────────────────────────────

  const sectionMarkets = SECTION_MARKETS[activeSection];

  return (
    <div className="min-h-screen bg-[#050508]">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        positionCount={openCount}
      />

      <main className="max-w-[1600px] mx-auto px-4 py-6">

        {/* ── Section tabs (Crypto / Equities / Commodities) ── */}
        {activeTab === 'trade' && (
          <>
            <div className="flex gap-1 mb-6 bg-[#0a0a0f] border border-[#1a1a2e] rounded-xl p-1 w-fit">
              {SECTIONS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setActiveSection(id)}
                  className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeSection === id
                      ? 'bg-[#141420] text-cyan-400 shadow'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Market grid */}
            <div className={`grid gap-3 mb-6 ${
              activeSection === 'equities'
                ? 'grid-cols-3 sm:grid-cols-6'
                : activeSection === 'commodities'
                ? 'grid-cols-3 sm:grid-cols-6'
                : 'grid-cols-3'
            }`}>
              {sectionMarkets.map((sym) => (
                <MarketCard
                  key={sym}
                  symbol={sym}
                  selected={form.market === sym}
                  tradeable={true}
                  onClick={() => setForm((f) => ({ ...f, market: sym as Market, strike: 0 }))}
                />
              ))}
            </div>

            {/* Trade panel — all markets */}
            <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr_320px] gap-5">
              <div className="bg-[#0a0a0f] border border-[#1a1a2e] rounded-2xl p-5">
                <h2 className="text-sm font-semibold text-gray-300 mb-4">Configure Option</h2>
                <OptionSelector value={form} onChange={setForm} />
              </div>

              <div className="space-y-5">
                <div className="bg-[#0a0a0f] border border-[#1a1a2e] rounded-2xl p-5">
                  <IVSurface market={form.market} spot={spot} atmIV={iv} rho={-0.1} phi={0.05} />
                </div>
                <div className="bg-[#0a0a0f] border border-[#1a1a2e] rounded-2xl p-5">
                  <GreeksDashboard greeks={greeks} spotPrice={spot} iv={iv} />
                </div>
              </div>

              <div className="bg-[#0a0a0f] border border-[#1a1a2e] rounded-2xl p-5">
                <h2 className="text-sm font-semibold text-gray-300 mb-4">Quote & Buy</h2>
                <PriceQuote form={form} onBuy={() => setShowModal(true)} />
              </div>
            </div>
          </>
        )}

        {/* ── Positions ── */}
        {activeTab === 'positions' && (
          <div className="max-w-3xl">
            <div className="bg-[#0a0a0f] border border-[#1a1a2e] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-sm font-semibold text-gray-300">My Options</h2>
                <button
                  onClick={() => setActiveTab('trade')}
                  className="btn-primary text-xs py-1.5 px-3"
                >
                  + New option
                </button>
              </div>
              <PositionsList
                positions={positions}
                prices={prices}
                onExercise={handleExercise}
                onClose={handleClose}
              />
            </div>
          </div>
        )}

        {/* ── Liquidity ── */}
        {activeTab === 'liquidity' && (
          <div className="max-w-4xl">
            <div className="bg-[#0a0a0f] border border-[#1a1a2e] rounded-2xl p-5">
              <div className="mb-5">
                <h2 className="text-sm font-semibold text-gray-300">Liquidity Pools</h2>
                <p className="text-xs text-gray-600 mt-1">
                  Earn trading fees + theta decay as an options LP. Delta risk is hedged via Pacifica perps.
                </p>
              </div>
              <LiquidityPanel />
            </div>
          </div>
        )}

        {/* ── Analytics ── */}
        {activeTab === 'analytics' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {CRYPTO_MARKETS.map((market) => (
              <div key={market} className="bg-[#0a0a0f] border border-[#1a1a2e] rounded-2xl p-5">
                <IVSurface
                  market={market}
                  spot={prices[market] || 0}
                  atmIV={ivOracle[market]}
                  rho={-0.1}
                  phi={0.05}
                />
              </div>
            ))}

            <div className="bg-[#0a0a0f] border border-[#1a1a2e] rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-gray-300 mb-4">Protocol Stats</h3>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Total Volume',   value: '$2.4M',  sub: '24h' },
                  { label: 'Open Interest',  value: '$8.7M',  sub: 'notional' },
                  { label: 'Total TVL',      value: '$1.2M',  sub: 'USDC' },
                  { label: 'Platform Fees',  value: '0.05%',  sub: 'flat rate' },
                  { label: 'Fees Collected', value: '$1,240', sub: '24h' },
                  { label: 'Active Options', value: '847',    sub: 'positions' },
                ].map(({ label, value, sub }) => (
                  <div key={label} className="bg-[#0f0f18] border border-[#1a1a2e] rounded-xl p-4">
                    <div className="text-xl font-mono font-semibold text-cyan-400">{value}</div>
                    <div className="text-xs text-gray-500 mt-1">{label}</div>
                    <div className="text-xs text-gray-700">{sub}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {showModal && (
        <TradeModal
          form={form}
          iv={iv}
          onClose={() => setShowModal(false)}
          onConfirm={handleConfirmTrade}
        />
      )}
    </div>
  );
}
