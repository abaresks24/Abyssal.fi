'use client';
/**
 * PrivyVaultBridge — surfaces the Privy embedded wallet's PublicKey and
 * signing methods to LPVault so deposits work even without an external wallet.
 *
 * This component MUST only be rendered inside a PrivyProvider.
 * LPVault guards the render with: privyReady && <PrivyVaultBridge …/>
 */
import { useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useSolanaWallets } from '@privy-io/react-auth/solana';
import { PublicKey } from '@solana/web3.js';

interface Props {
  onUpdate: (pk: PublicKey | null, wallet: any) => void;
}

export function PrivyVaultBridge({ onUpdate }: Props) {
  const { authenticated } = usePrivy();
  const { wallets } = useSolanaWallets();

  useEffect(() => {
    if (!authenticated) {
      onUpdate(null, null);
      return;
    }
    // walletClientType === 'privy' → embedded wallet created by Privy on email login
    const embedded = (wallets as any[]).find(w => w.walletClientType === 'privy');
    if (embedded?.address) {
      try { onUpdate(new PublicKey(embedded.address), embedded); }
      catch  { onUpdate(null, null); }
    }
  }, [authenticated, wallets, onUpdate]);

  return null;
}
