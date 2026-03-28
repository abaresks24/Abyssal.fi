'use client';
import React, { useCallback } from 'react';
import { useOptionBuilder } from '@/hooks/useOptionBuilder';
import { useBlackScholes } from '@/hooks/useBlackScholes';
import { useAFVR } from '@/hooks/useAFVR';
import { usePacificaWS } from '@/hooks/usePacificaWS';
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
  const { market, side, strike, expiry, size } = useOptionBuilder();
  const { price: spot } = usePacificaWS(market);
  const { iv } = useAFVR(market);

  const { premium, greeks, totalPremium, fee, breakeven } = useBlackScholes(
    spot, strike, expiry, iv, side, size,
  );

  const handleBuy = useCallback(() => {
    console.log('Buy', { market, side, strike, expiry, size, totalPremium });
  }, [market, side, strike, expiry, size, totalPremium]);

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

      {/* Strike — fully custom */}
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
        disabled={strike <= 0 || premium <= 0}
        onBuy={handleBuy}
      />

      {/* Positions */}
      <PositionsList />
    </div>
  );
}
