'use client';
import React, { useState } from 'react';
import { useEffectiveWallet } from '@/hooks/useEffectiveWallet';
import type { Side, Action } from '@/types';

interface Props {
  side:       Side;
  action:     Action;
  totalCost:  number;
  netReceive: number;
  disabled:   boolean;
  onBuy:      () => void;
}

export const BuyButton = React.memo(function BuyButton({ side, action, totalCost, netReceive, disabled, onBuy }: Props) {
  const { publicKey } = useEffectiveWallet();
  const [hover, setHover] = useState(false);

  const isSell    = action === 'sell';
  const color     = isSell ? 'var(--amber)' : (side === 'call' ? 'var(--green)' : 'var(--red)');
  const glowColor = isSell
    ? 'rgba(236,202,90,0.30)'
    : (side === 'call' ? 'rgba(2,199,123,0.30)' : 'rgba(235,54,90,0.30)');
  const bgColor   = isSell
    ? 'rgba(236,202,90,0.14)'
    : (side === 'call' ? 'rgba(2,199,123,0.15)' : 'rgba(235,54,90,0.15)');
  const bgHover   = isSell
    ? 'rgba(236,202,90,0.22)'
    : (side === 'call' ? 'rgba(2,199,123,0.25)' : 'rgba(235,54,90,0.25)');

  const sideLabel = side === 'call' ? 'Call' : 'Put';
  const fmtNum = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const label = isSell
    ? `Sell ${sideLabel}${!disabled && netReceive > 0 ? ` · receive $${fmtNum(netReceive)}` : ''}`
    : `Buy ${sideLabel}${!disabled && totalCost > 0 ? ` · $${fmtNum(totalCost)}` : ''}`;

  if (!publicKey) {
    return (
      <button disabled style={{
        width: '100%', padding: '12px 0', borderRadius: 6,
        border: '1px solid var(--border)', background: 'var(--bg2)',
        color: 'var(--text3)', fontSize: 13, fontWeight: 600, cursor: 'not-allowed',
        letterSpacing: '0.02em',
      }}>
        Connect wallet to trade
      </button>
    );
  }

  return (
    <button
      onClick={onBuy}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '100%',
        padding: '12px 0',
        borderRadius: 6,
        border: disabled ? '1px solid var(--border)' : `1px solid ${color}`,
        background: disabled ? 'var(--bg2)' : (hover ? bgHover : bgColor),
        color: disabled ? 'var(--text3)' : color,
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: '0.03em',
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: (!disabled && hover) ? `0 0 20px ${glowColor}, 0 4px 12px rgba(0,0,0,0.2)` : 'none',
        transform: (!disabled && hover) ? 'translateY(-1px)' : 'none',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {label}
    </button>
  );
});
