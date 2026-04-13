'use client';
import React, { useCallback, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useOptionBuilder } from '@/hooks/useOptionBuilder';
import { useBlackScholes } from '@/hooks/useBlackScholes';
import { useAFVR } from '@/hooks/useAFVR';
import { usePacificaWS } from '@/hooks/usePacificaWS';
import { useSignerWallet } from '@/hooks/useSignerWallet';
import { PacificaOptionsClient } from '@/lib/anchor_client';
import { VAULT_AUTHORITY, expiryToDate, solscanTx } from '@/lib/constants';
import { ActionToggle } from './ActionToggle';
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

  // Collateral for sell:
  //   Sell Call → lock size × spot (underlying value in USDC)
  //   Sell Put  → lock size × strike (USDC)
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
      const client    = new PacificaOptionsClient(walletForClient as any);
      const authority = new PublicKey(VAULT_AUTHORITY);
      const expiryTs  = Math.floor(expiryToDate(expiry).getTime() / 1000);
      const slippage  = 1.05;

      let sig: string;
      if (action === 'buy') {
        sig = await client.buyOption({
          vaultAuthority: authority,
          market,
          optionType:     side === 'call' ? 'Call' : 'Put',
          strikeUsdc:     strike,
          expiry:         expiryTs,
          sizeUnderlying: size,
          maxPremiumUsdc: totalPremium * slippage,
        });
      } else {
        sig = await client.sellOption({
          vaultAuthority: authority,
          market,
          optionType:      side === 'call' ? 'Call' : 'Put',
          strikeUsdc:      strike,
          expiry:          expiryTs,
          sizeUnderlying:  size,
          minProceedsUsdc: netReceive / slippage,
        });
      }
      setTxSig(sig);
    } catch (e: any) {
      setErr(e?.message ?? 'Transaction failed');
    } finally {
      setLoading(false);
    }
  }, [publicKey, signerReady, walletForClient, market, side, action, strike, expiry, size, totalPremium, netReceive]);

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

      {/* Expiry */}
      <ExpirySelector />

      {/* Buy / Sell */}
      <ActionToggle />

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
          action={action}
          spot={spot}
        />
      )}

      {/* CTA */}
      <BuyButton
        side={side}
        action={action}
        totalCost={totalPremium + fee}
        netReceive={netReceive}
        disabled={strike <= 0 || size <= 0 || loading}
        onBuy={handleConfirm}
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
            href={solscanTx(txSig)}
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
