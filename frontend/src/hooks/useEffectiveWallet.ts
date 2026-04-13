'use client';

import { useMemo } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { PRIVY_ENABLED } from '@/components/WalletProvider';

let usePrivyHook: any = null;
let useWalletsHook: any = null;

if (PRIVY_ENABLED) {
  try {
    const privy = require('@privy-io/react-auth');
    const privySolana = require('@privy-io/react-auth/solana');
    usePrivyHook = privy.usePrivy;
    useWalletsHook = privySolana.useWallets;
  } catch {}
}

/**
 * Unified wallet hook that returns publicKey from either Privy or adapter.
 * Solves the issue where useWallet().publicKey is null when Privy is the auth source
 * but the adapter bridge hasn't synced yet.
 */
export function useEffectiveWallet() {
  const adapterWallet = useWallet();
  const privyState = usePrivyHook?.() ?? { authenticated: false };
  const privyWallets = useWalletsHook?.()?.wallets ?? [];

  return useMemo(() => {
    // Adapter publicKey is authoritative when available
    if (adapterWallet.publicKey) {
      return {
        publicKey: adapterWallet.publicKey,
        connected: true,
        wallet: adapterWallet,
      };
    }

    // Fallback: derive from Privy wallet
    if (PRIVY_ENABLED && privyState.authenticated && privyWallets.length > 0) {
      try {
        const pk = new PublicKey(privyWallets[0].address);
        return {
          publicKey: pk,
          connected: true,
          wallet: adapterWallet,
        };
      } catch {}
    }

    return {
      publicKey: null as PublicKey | null,
      connected: false,
      wallet: adapterWallet,
    };
  }, [adapterWallet, adapterWallet.publicKey, privyState.authenticated, privyWallets]);
}
