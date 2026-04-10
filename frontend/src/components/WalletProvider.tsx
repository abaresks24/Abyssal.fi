'use client';
import { type FC, type ReactNode, useMemo, useEffect, useRef } from 'react';

import { PrivyProvider, usePrivy } from '@privy-io/react-auth';
import { toSolanaWalletConnectors, useWallets } from '@privy-io/react-auth/solana';

import { ConnectionProvider, WalletProvider, useWallet } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  CoinbaseWalletAdapter,
  TrustWalletAdapter,
  LedgerWalletAdapter,
  BitgetWalletAdapter,
  Coin98WalletAdapter,
  TorusWalletAdapter,
  NightlyWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import { SOLANA_RPC } from '@/lib/constants';

export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? '';
export const PRIVY_ENABLED =
  PRIVY_APP_ID.length > 5 && !PRIVY_APP_ID.includes('YOUR_PRIVY');

// Created at module level so Wallet Standard listeners persist across renders.
const solanaConnectors = PRIVY_ENABLED
  ? toSolanaWalletConnectors({ shouldAutoConnect: false })
  : undefined;

// ── Solana wallet-adapter (kept for anchor_client compatibility) ──────────────

function SolanaAdapters({ children }: { children: ReactNode }) {
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter({ network: WalletAdapterNetwork.Devnet }),
    new CoinbaseWalletAdapter(),
    new TrustWalletAdapter(),
    new LedgerWalletAdapter(),
    new BitgetWalletAdapter(),
    new Coin98WalletAdapter(),
    new TorusWalletAdapter(),
    new NightlyWalletAdapter(),
  ], []);

  return (
    <ConnectionProvider endpoint={SOLANA_RPC}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}

// ── Privy → Solana adapter bridge ────────────────────────────────────────────
// After Privy authenticates a wallet, sync it into wallet-adapter so that
// anchor_client's useWallet() gets publicKey + signTransaction.

function PrivyAdapterSync() {
  const { authenticated, ready } = usePrivy();
  const { wallets: privyWallets } = useWallets();
  const { wallets: adapterWallets, select, connected, disconnect } = useWallet();
  const syncedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!authenticated) {
      if (connected) { syncedRef.current = null; disconnect(); }
      return;
    }
    const pw = privyWallets[0];
    if (!pw) return;
    if (syncedRef.current === pw.address) return;
    const walletName = (pw as any).standardWallet?.name as string | undefined;
    if (!walletName) return;
    const match = adapterWallets.find(
      w => w.adapter.name.toLowerCase() === walletName.toLowerCase()
    );
    if (!match) return;
    syncedRef.current = pw.address;
    select(match.adapter.name as any);
    match.adapter.connect().catch(() => { syncedRef.current = null; });
  }, [ready, authenticated, privyWallets, adapterWallets, select, connected, disconnect]);

  return null;
}

// ── Root provider ─────────────────────────────────────────────────────────────

export const WalletContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
  if (!PRIVY_ENABLED) {
    return <SolanaAdapters>{children}</SolanaAdapters>;
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ['wallet', 'email'],
        appearance: {
          theme: 'dark',
          accentColor: '#55c3e9',
          logo: '/logo.svg',
          walletChainType: 'solana-only',
          landingHeader: 'Connect to Abyssal',
          loginMessage: 'Trade on-chain options on Solana',
          walletList: ['detected_wallets', 'phantom', 'solflare', 'backpack', 'coinbase_wallet'],
        },
        embeddedWallets: {
          solana: { createOnLogin: 'users-without-wallets' },
        },
        externalWallets: {
          solana: { connectors: solanaConnectors! },
        },
      }}
    >
      <SolanaAdapters>
        <PrivyAdapterSync />
        {children}
      </SolanaAdapters>
    </PrivyProvider>
  );
};
