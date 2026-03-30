'use client';
import { type FC, type ReactNode, useMemo } from 'react';

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

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? '';

export const WalletContextProvider: FC<Props> = ({ children }) => {
  const network = WalletAdapterNetwork.Devnet;

  // All standard Solana wallet adapters — used by anchor_client via useWallet()
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
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        // Dark theme matching Abyssal palette
        appearance: {
          theme: 'dark',
          accentColor: '#55c3e9',
          logo: '/logo.svg',
          // Show only Solana wallets in the modal
          walletChainType: 'solana-only',
          landingHeader: 'Connect to Abyssal',
          loginMessage: 'Trade on-chain options on Solana',
          // Prioritise common Solana wallets in the list
          walletList: [
            'detected_wallets',
            'phantom',
            'solflare',
            'backpack',
            'coinbase_wallet',
          ],
        },
        loginMethods: ['wallet', 'email'],
        // Account abstraction: auto-create an embedded Solana wallet for
        // users who connect without a browser extension (email login, etc.)
        embeddedWallets: {
          solana: { createOnLogin: 'users-without-wallets' },
        },
        // External wallet connectors (Phantom, Solflare, Backpack, etc.)
        externalWallets: {
          solana: { connectors: toSolanaWalletConnectors() },
        },
      }}
    >
      {/* ConnectionProvider gives anchor_client its RPC endpoint */}
      <ConnectionProvider endpoint={SOLANA_RPC}>
        {/* WalletProvider + WalletModalProvider kept for useAnchorWallet() */}
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>
            {children}
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </PrivyProvider>
  );
};
