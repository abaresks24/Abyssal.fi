'use client';

import React, { createContext, useContext, useMemo, type ReactNode } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useWallet, type WalletContextState } from '@solana/wallet-adapter-react';
import { PRIVY_ENABLED } from '@/components/WalletProvider';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets } from '@privy-io/react-auth/solana';

interface EffectiveWalletState {
  publicKey: PublicKey | null;
  connected: boolean;
  wallet: WalletContextState;
}

const Ctx = createContext<EffectiveWalletState | null>(null);

/** Provider when Privy is enabled — reads from both Privy + adapter. */
function PrivyEffectiveProvider({ children }: { children: ReactNode }) {
  const adapterWallet = useWallet();
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();

  const value = useMemo<EffectiveWalletState>(() => {
    if (adapterWallet.publicKey) {
      return { publicKey: adapterWallet.publicKey, connected: true, wallet: adapterWallet };
    }
    if (authenticated && wallets.length > 0) {
      try {
        const pk = new PublicKey(wallets[0].address);
        return { publicKey: pk, connected: true, wallet: adapterWallet };
      } catch {}
    }
    return { publicKey: null, connected: false, wallet: adapterWallet };
  }, [adapterWallet, adapterWallet.publicKey, authenticated, wallets]);

  return React.createElement(Ctx.Provider, { value }, children);
}

/** Provider when Privy is disabled — just reads from adapter. */
function AdapterOnlyProvider({ children }: { children: ReactNode }) {
  const adapterWallet = useWallet();

  const value = useMemo<EffectiveWalletState>(() => ({
    publicKey: adapterWallet.publicKey,
    connected: adapterWallet.connected,
    wallet: adapterWallet,
  }), [adapterWallet, adapterWallet.publicKey, adapterWallet.connected]);

  return React.createElement(Ctx.Provider, { value }, children);
}

/** Wrap inside WalletProvider (and PrivyProvider if enabled). */
export function EffectiveWalletProvider({ children }: { children: ReactNode }) {
  if (PRIVY_ENABLED) return React.createElement(PrivyEffectiveProvider, null, children);
  return React.createElement(AdapterOnlyProvider, null, children);
}

/** Returns the effective wallet — works with Privy or adapter. */
export function useEffectiveWallet() {
  const ctx = useContext(Ctx);
  const adapterWallet = useWallet();

  if (ctx) return ctx;

  // Fallback if provider not mounted
  return {
    publicKey: adapterWallet.publicKey,
    connected: adapterWallet.connected,
    wallet: adapterWallet,
  };
}
