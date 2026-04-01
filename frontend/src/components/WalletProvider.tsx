'use client';
import { type FC, type ReactNode, useMemo, useState, useEffect, useRef, createContext, useContext } from 'react';

// Privy — account abstraction + unified wallet modal
import { PrivyProvider, usePrivy } from '@privy-io/react-auth';
import { toSolanaWalletConnectors, useWallets } from '@privy-io/react-auth/solana';

// Solana wallet adapter — required by anchor_client
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

interface Props { children: ReactNode; }

// Privy is enabled only when a real app ID is configured.
const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? '';
export const PRIVY_ENABLED =
  PRIVY_APP_ID.length > 5 && !PRIVY_APP_ID.includes('YOUR_PRIVY');

// toSolanaWalletConnectors() MUST be called at module level — calling it
// inside a component re-creates the connectors object on every render and
// prevents onMount/onUnmount from registering the wallet detection listeners.
const solanaConnectors = PRIVY_ENABLED
  ? toSolanaWalletConnectors({ shouldAutoConnect: false })
  : undefined;

// Context that signals PrivyProvider is mounted and safe to call Privy hooks.
export const PrivyReadyContext = createContext(false);
export const usePrivyReady = () => useContext(PrivyReadyContext);

// ── Privy → Solana adapter bridge ────────────────────────────────────────────
// After Privy connects an external wallet (Phantom, Solflare…), sync it into
// the Solana wallet-adapter so that anchor_client's useWallet() works.
// The second adapter.connect() does NOT show a popup: Phantom is already
// approved via Privy, so it returns immediately with the public key.

function PrivyAdapterSync() {
  const { authenticated } = usePrivy();
  const { wallets: privyWallets } = useWallets();
  const { wallets: adapterWallets, select, publicKey, connected, disconnect } = useWallet();
  const syncedRef = useRef<string | null>(null);

  useEffect(() => {
    // ConnectedStandardSolanaWallet exposes .address and .standardWallet.name
    const externalWallet = privyWallets.find(w => {
      const name = (w as any).standardWallet?.name ?? '';
      return name !== 'Privy';
    });

    if (authenticated && externalWallet) {
      if (syncedRef.current === externalWallet.address) return;

      const walletName = (externalWallet as any).standardWallet?.name ?? '';
      const adapterWallet = adapterWallets.find(w =>
        w.adapter.name.toLowerCase() === walletName.toLowerCase()
      );
      if (adapterWallet && !connected) {
        syncedRef.current = externalWallet.address;
        select(adapterWallet.adapter.name as any);
        // Wallet already approved via SIWS — no popup will appear
        adapterWallet.adapter.connect().catch(() => { syncedRef.current = null; });
      }
      return;
    }

    if (!authenticated && connected) {
      syncedRef.current = null;
      disconnect();
    }
  }, [authenticated, privyWallets, adapterWallets, select, connected, disconnect, publicKey]);

  return null;
}

// ── Solana adapter providers ──────────────────────────────────────────────────

function SolanaAdapters({ children }: { children: ReactNode }) {
  const network = WalletAdapterNetwork.Devnet;
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter({ network }),
    new CoinbaseWalletAdapter(),
    new TrustWalletAdapter(),
    new LedgerWalletAdapter(),
    new BitgetWalletAdapter(),
    new Coin98WalletAdapter(),
    new TorusWalletAdapter(),
    new NightlyWalletAdapter(),
  ], [network]);

  return (
    <ConnectionProvider endpoint={SOLANA_RPC}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}

function PrivyInner({ children }: { children: ReactNode }) {
  return (
    <>
      <PrivyAdapterSync />
      {children}
    </>
  );
}

// ── Root provider ─────────────────────────────────────────────────────────────

export const WalletContextProvider: FC<Props> = ({ children }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || !PRIVY_ENABLED) {
    return (
      <PrivyReadyContext.Provider value={false}>
        <SolanaAdapters>{children}</SolanaAdapters>
      </PrivyReadyContext.Provider>
    );
  }

  return (
    <PrivyReadyContext.Provider value={true}>
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
            walletList: ['detected_solana_wallets', 'phantom', 'solflare', 'backpack', 'coinbase_wallet'],
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
          <PrivyInner>{children}</PrivyInner>
        </SolanaAdapters>
      </PrivyProvider>
    </PrivyReadyContext.Provider>
  );
};
