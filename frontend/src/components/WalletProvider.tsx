'use client';
import { type FC, type ReactNode, useMemo, useRef, useEffect, createContext, useContext } from 'react';

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

interface Props { children: ReactNode; }

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? '';
export const PRIVY_ENABLED =
  PRIVY_APP_ID.length > 5 && !PRIVY_APP_ID.includes('YOUR_PRIVY');

// toSolanaWalletConnectors() MUST be at module level — not inside a component.
// Re-creating it on every render prevents onMount/onUnmount from registering
// the Wallet Standard detection listeners that detect installed wallets.
const solanaConnectors = PRIVY_ENABLED
  ? toSolanaWalletConnectors({ shouldAutoConnect: false })
  : undefined;

export const PrivyReadyContext = createContext(false);
export const usePrivyReady = () => useContext(PrivyReadyContext);

// ── Privy → Solana adapter bridge ────────────────────────────────────────────
// After Privy authenticates an external wallet, sync it into the Solana
// wallet-adapter so anchor_client's useWallet() has publicKey + signTransaction.
// We call adapter.connect() once. Since Phantom is already approved via Privy,
// its connect() returns immediately without showing a second popup.

function PrivyAdapterSync() {
  const { authenticated, ready } = usePrivy();
  const { wallets: privyWallets } = useWallets();
  const { wallets: adapterWallets, select, connected, disconnect } = useWallet();
  const syncedRef = useRef<string | null>(null);

  useEffect(() => {
    // Wait for Privy to finish loading before making any decisions.
    // Without this guard, the effect fires with authenticated=false on first
    // render and calls disconnect(), wiping publicKey before Privy loads.
    if (!ready) return;

    if (!authenticated) {
      if (connected) {
        syncedRef.current = null;
        disconnect();
      }
      return;
    }

    // Find first external (non-embedded) wallet authenticated by Privy
    const pw = privyWallets[0];
    if (!pw) return;
    if (syncedRef.current === pw.address) return;

    // Map to the matching wallet-adapter instance by name
    // ConnectedStandardSolanaWallet.standardWallet.name === 'Phantom', 'Solflare', etc.
    const walletName = (pw as any).standardWallet?.name as string | undefined;
    if (!walletName) return;

    const match = adapterWallets.find(
      w => w.adapter.name.toLowerCase() === walletName.toLowerCase()
    );
    if (!match) return;

    syncedRef.current = pw.address;
    select(match.adapter.name as any);
    // Phantom is already approved — connect() resolves immediately, no popup
    match.adapter.connect().catch(() => { syncedRef.current = null; });
  }, [ready, authenticated, privyWallets, adapterWallets, select, connected, disconnect]);

  return null;
}

// ── Solana adapter (kept for anchor_client compatibility) ─────────────────────

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
      {/* autoConnect=false: Privy manages wallet connection, not the adapter */}
      <WalletProvider wallets={wallets} autoConnect={false}>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
}

// PrivyReadyBridge reads the actual Privy SDK readiness and passes it into
// PrivyReadyContext so ConnectButton only becomes clickable once Privy is
// fully initialized — not just once the component is mounted.
function PrivyReadyBridge({ children }: { children: ReactNode }) {
  const { ready } = usePrivy();
  return (
    <PrivyReadyContext.Provider value={ready}>
      {children}
    </PrivyReadyContext.Provider>
  );
}

function PrivyInner({ children }: { children: ReactNode }) {
  return (
    <PrivyReadyBridge>
      <PrivyAdapterSync />
      {children}
    </PrivyReadyBridge>
  );
}

export const WalletContextProvider: FC<Props> = ({ children }) => {
  if (!PRIVY_ENABLED) {
    return (
      <PrivyReadyContext.Provider value={false}>
        <SolanaAdapters>{children}</SolanaAdapters>
      </PrivyReadyContext.Provider>
    );
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
        <PrivyInner>{children}</PrivyInner>
      </SolanaAdapters>
    </PrivyProvider>
  );
};
