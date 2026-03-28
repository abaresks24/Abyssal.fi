'use client';
import React from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import type { Side } from '@/types';

interface Props {
  side: Side;
  totalCost: number;
  disabled: boolean;
  onBuy: () => void;
}

export const BuyButton = React.memo(function BuyButton({ side, totalCost, disabled, onBuy }: Props) {
  const { connected } = useWallet();
  const color  = side === 'call' ? 'var(--green)' : 'var(--red)';
  const dimColor = side === 'call' ? 'rgba(2,199,123,0.15)' : 'rgba(235,54,90,0.15)';

  if (!connected) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 10, color: 'var(--text3)', textAlign: 'center' }}>
          Connect wallet to trade
        </div>
        <WalletMultiButton style={{
          width: '100%', padding: '10px 0', borderRadius: 5,
          background: 'var(--bg3)', border: '1px solid var(--border2)',
          color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font)',
          justifyContent: 'center',
        }} />
      </div>
    );
  }

  return (
    <button
      onClick={onBuy}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '11px 0',
        borderRadius: 5,
        border: `1px solid ${color}`,
        background: disabled ? 'var(--bg2)' : dimColor,
        color: disabled ? 'var(--text3)' : color,
        fontSize: 13,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {disabled
        ? 'Enter parameters'
        : `Buy ${side === 'call' ? 'Call' : 'Put'} · $${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
    </button>
  );
});
