'use client';
import React, { useCallback, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useOptionBuilder } from '@/hooks/useOptionBuilder';
import { useBlackScholes } from '@/hooks/useBlackScholes';
import { useAFVR } from '@/hooks/useAFVR';
import { usePacificaWS } from '@/hooks/usePacificaWS';
import { PacificaOptionsClient } from '@/lib/anchor_client';
import { VAULT_AUTHORITY, expiryToDate } from '@/lib/constants';
import { SideToggle } from './SideToggle';
import { StrikeSelector } from './StrikeSelector';
import { SizeInput } from './SizeInput';
import { PayoffChart } from './PayoffChart';
import { PremiumDisplay } from './PremiumDisplay';
import { GreeksDisplay } from './GreeksDisplay';
import { OrderSummary } from './OrderSummary';
import { BuyButton } from './BuyButton';
import { PositionsList } from './PositionsList';

export function OptionBuilder() {
  const wallet = useWallet();
  const { market, side, strike, expiry, size } = useOptionBuilder();
  const { price: spot } = usePacificaWS(market);
  const { iv } = useAFVR(market);

  const { premium, greeks, totalPremium, fee, breakeven } = useBlackScholes(
    spot, strike, expiry, iv, side, size,
  );

  const [loading, setLoading] = useState(false);
  const [txSig, setTxSig]   = useState<string | null>(null);
  const [err, setErr]        = useState<string | null>(null);

  const handleBuy = useCallback(async () => {
    if (!wallet.publicKey || !wallet.connected) return;
    setLoading(true);
    setErr(null);
    setTxSig(null);
    try {
      const client    = new PacificaOptionsClient(wallet);
      const authority = new PublicKey(VAULT_AUTHORITY);
      const expiryTs  = Math.floor(expiryToDate(expiry).getTime() / 1000);
      const slippage  = 1.05; // 5% max slippage

      const sig = await client.buyOption({
        vaultAuthority: authority,
        market,
        optionType:     side === 'call' ? 'Call' : 'Put',
        strikeUsdc:     strike,
        expiry:         expiryTs,
        sizeUnderlying: size,
        maxPremiumUsdc: totalPremium * slippage,
      });
      setTxSig(sig);
    } catch (e: any) {
      setErr(e?.message ?? 'Transaction failed');
    } finally {
      setLoading(false);
    }
  }, [wallet, market, side, strike, expiry, size, totalPremium]);

  return (
    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>

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

      {/* Call / Put */}
      <SideToggle />

      {/* Strike */}
      <div>
        <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
          Strike
        </div>
        <StrikeSelector spot={spot} />
      </div>

      {/* Premium */}
      <PremiumDisplay premium={premium} totalPremium={totalPremium} side={side} />

      {/* Payoff */}
      <PayoffChart strike={strike} premium={premium} size={size} side={side} currentSpot={spot} />

      {/* Greeks */}
      <GreeksDisplay greeks={greeks} />

      {/* Size */}
      <SizeInput spot={spot} />

      {/* Order summary */}
      {strike > 0 && premium > 0 && (
        <OrderSummary
          strike={strike}
          expiry={expiry}
          size={size}
          market={market}
          totalPremium={totalPremium}
          fee={fee}
          breakeven={breakeven}
          side={side}
        />
      )}

      {/* CTA */}
      <BuyButton
        side={side}
        totalCost={totalPremium + fee}
        disabled={strike <= 0 || premium <= 0 || loading}
        onBuy={handleBuy}
      />

      {/* Tx feedback */}
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
          <a
            href={`https://solscan.io/tx/${txSig}?cluster=devnet`}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--cyan)', textDecoration: 'none' }}
          >
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

      {/* Positions */}
      <PositionsList />
    </div>
  );
}
