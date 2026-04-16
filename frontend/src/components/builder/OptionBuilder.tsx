'use client';
import React, { useCallback, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useOptionBuilder } from '@/hooks/useOptionBuilder';
import { useBlackScholes } from '@/hooks/useBlackScholes';
import { useAFVR } from '@/hooks/useAFVR';
import { usePacificaWS } from '@/hooks/usePacificaWS';
import { useSignerWallet } from '@/hooks/useSignerWallet';
import { PacificaOptionsClient } from '@/lib/anchor_client';
import { blackScholesPrice, calcFee } from '@/lib/blackScholes';
import { VAULT_AUTHORITY, expiryToDate, expiryStringToYears, solscanTx } from '@/lib/constants';
import { SideToggle } from './SideToggle';
import { ExpirySelector } from '@/components/chain/ExpirySelector';
import { StrikeSelector } from './StrikeSelector';
import { SizeInput } from './SizeInput';
import { PayoffChart } from './PayoffChart';
import { PremiumDisplay } from './PremiumDisplay';
import { GreeksDisplay } from './GreeksDisplay';
import { OrderSummary } from './OrderSummary';
import { BuyButton } from './BuyButton';
import { PositionsList } from './PositionsList';

export function OptionBuilder() {
  const { publicKey, walletForClient, ready: signerReady } = useSignerWallet();
  const { market, side, action, strike, expiry, size } = useOptionBuilder();
  const { price: spot } = usePacificaWS(market);
  const { iv } = useAFVR(market);

  const { premium, greeks, totalPremium, fee, breakeven } = useBlackScholes(
    spot, strike, expiry, iv, side, size,
  );

  const [loading, setLoading] = useState(false);
  const [txSig, setTxSig]     = useState<string | null>(null);
  const [err, setErr]          = useState<string | null>(null);
  const [slippagePct, setSlippagePct] = useState(1); // 1% default

  const collateral = action === 'sell'
    ? (side === 'call' ? size * (spot > 0 ? spot : strike) : size * strike)
    : 0;

  const netReceive = totalPremium - fee;

  const handleConfirm = useCallback(async () => {
    if (!publicKey || !signerReady) return;
    setLoading(true);
    setErr(null);
    setTxSig(null);
    try {
      // 1. Refresh oracle price (must be < 60s old for on-chain check)
      setErr('Refreshing price feed…');
      const keeperRes = await fetch('/api/keeper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ market }),
      });
      const keeperData = await keeperRes.json();
      if (!keeperRes.ok) {
        throw new Error(`Price feed update failed: ${keeperData.error ?? 'unknown'}`);
      }
      setErr(null);

      // 2. Recalculate premium with REAL price from keeper
      const realSpot = keeperData.price as number;
      const realIv   = keeperData.iv as number;
      const T        = expiryStringToYears(expiry);
      const realPremiumPerUnit = blackScholesPrice(realSpot, strike, T, realIv, 0, side);
      const realTotalPremium   = realPremiumPerUnit * size;
      const slippageMultiplier = 1 + (slippagePct / 100);

      // maxPremium = premium * (1 + slippage%)
      const maxPremiumUsdc = realTotalPremium * slippageMultiplier;

      console.log(`[Trade] ${action} ${side} | spot=$${realSpot} iv=${realIv} | premium=$${realTotalPremium.toFixed(2)} | slippage=${slippagePct}% | max=$${maxPremiumUsdc.toFixed(2)}`);

      const client    = new PacificaOptionsClient(walletForClient as any);
      const authority = new PublicKey(VAULT_AUTHORITY);
      const expiryTs  = Math.floor(expiryToDate(expiry).getTime() / 1000);

      let sig: string;
      if (action === 'buy') {
        sig = await client.buyOption({
          vaultAuthority: authority,
          market,
          optionType:     side === 'call' ? 'Call' : 'Put',
          strikeUsdc:     strike,
          expiry:         expiryTs,
          sizeUnderlying: size,
          maxPremiumUsdc,
        });
      } else {
        const minProceedsUsdc = realTotalPremium / slippageMultiplier;
        sig = await client.sellOption({
          vaultAuthority: authority,
          market,
          optionType:      side === 'call' ? 'Call' : 'Put',
          strikeUsdc:      strike,
          expiry:          expiryTs,
          sizeUnderlying:  size,
          minProceedsUsdc,
        });
      }
      setTxSig(sig);
    } catch (e: any) {
      setErr(e?.message ?? 'Transaction failed');
    } finally {
      setLoading(false);
    }
  }, [publicKey, signerReady, walletForClient, market, side, action, strike, expiry, size, slippagePct]);

  return (
    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Header */}
      <div style={{
        fontSize: 12, fontWeight: 600, color: 'var(--text)',
        paddingBottom: 6, borderBottom: '1px solid var(--border)',
      }}>
        Option Builder
        <span style={{ float: 'right', fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>
          {market} · {expiry}
        </span>
      </div>

      <ExpirySelector />
      <SideToggle />

      <div>
        <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
          Strike
        </div>
        <StrikeSelector spot={spot} />
      </div>

      <PremiumDisplay premium={premium} totalPremium={totalPremium} side={side} />
      <PayoffChart strike={strike} premium={premium} size={size} side={side} currentSpot={spot} />
      <GreeksDisplay greeks={greeks} />
      <SizeInput spot={spot} />

      {/* Slippage selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Slippage</span>
        {[0.5, 1, 2, 5].map(pct => (
          <button
            key={pct}
            onClick={() => setSlippagePct(pct)}
            style={{
              padding: '2px 7px', borderRadius: 4, fontSize: 11, fontFamily: 'var(--mono)',
              border: `1px solid ${slippagePct === pct ? 'var(--cyan)' : 'var(--border2)'}`,
              background: slippagePct === pct ? 'var(--cyan-dim)' : 'transparent',
              color: slippagePct === pct ? 'var(--cyan)' : 'var(--text3)',
              cursor: 'pointer',
            }}
          >
            {pct}%
          </button>
        ))}
        <input
          type="number"
          min={0.1}
          max={50}
          step={0.1}
          value={slippagePct}
          onChange={e => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v) && v > 0 && v <= 50) setSlippagePct(v);
          }}
          style={{
            width: 44, padding: '2px 4px', borderRadius: 4, fontSize: 11,
            border: '1px solid var(--border2)', background: 'var(--bg3)',
            color: 'var(--text)', fontFamily: 'var(--mono)', textAlign: 'center',
          }}
        />
      </div>

      {strike > 0 && premium > 0 && (
        <OrderSummary
          strike={strike} expiry={expiry} size={size} market={market}
          totalPremium={totalPremium} fee={fee} breakeven={breakeven}
          side={side} action={action} spot={spot}
        />
      )}

      <BuyButton
        side={side} action={action}
        totalCost={totalPremium + fee} netReceive={netReceive}
        disabled={strike <= 0 || size <= 0 || loading}
        onBuy={handleConfirm}
      />

      {loading && (
        <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center' }}>
          Confirming transaction...
        </div>
      )}
      {txSig && (
        <div style={{
          fontSize: 11, color: 'var(--green)', padding: '7px 10px',
          background: 'rgba(2,199,123,0.08)', borderRadius: 4,
        }}>
          Confirmed ·{' '}
          <a href={solscanTx(txSig)} target="_blank" rel="noreferrer"
            style={{ color: 'var(--cyan)', textDecoration: 'none' }}>
            View on Solscan
          </a>
        </div>
      )}
      {err && (
        <div style={{
          fontSize: 11, color: 'var(--red)', padding: '7px 10px',
          background: 'rgba(235,54,90,0.08)', borderRadius: 4,
        }}>
          {err}
        </div>
      )}

      <PositionsList />
    </div>
  );
}
