'use client';
import { type FC, type ReactNode, useMemo, useState, useEffect } from 'react';

// Privy — account abstraction + unified wallet modal
import { PrivyProvider } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';

// Solana wallet adapter — kept for anchor_client compatibility
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
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
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { SOLANA_RPC } from '@/lib/constants';
import '@solana/wallet-adapter-react-ui/styles.css';

interface Props { children: ReactNode; }

// Privy is enabled only when a real app ID is configured.
// During local builds with the placeholder value, we skip Privy entirely
// so `next build` doesn't throw during prerender.
const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? '';
export const PRIVY_ENABLED =
  PRIVY_APP_ID.length > 5 && !PRIVY_APP_ID.includes('YOUR_PRIVY');

// Solana adapter providers (shared regardless of Privy status)
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
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export const WalletContextProvider: FC<Props> = ({ children }) => {
  // Delay Privy initialisation to the client to avoid SSR prerender errors.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || !PRIVY_ENABLED) {
    // SSR pass or no valid Privy app ID → Solana adapter only
    return <SolanaAdapters>{children}</SolanaAdapters>;
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#55c3e9',
          logo: '/logo.svg',
          walletChainType: 'solana-only',
          landingHeader: 'Connect to Abyssal',
          loginMessage: 'Trade on-chain options on Solana',
          walletList: ['detected_wallets', 'phantom', 'solflare', 'backpack', 'coinbase_wallet'],
        },
        loginMethods: ['wallet', 'email'],
        embeddedWallets: {
          solana: { createOnLogin: 'users-without-wallets' },
        },
        externalWallets: {
          solana: { connectors: toSolanaWalletConnectors() },
        },
      }}
    >
      <SolanaAdapters>{children}</SolanaAdapters>
    </PrivyProvider>
  );
};
