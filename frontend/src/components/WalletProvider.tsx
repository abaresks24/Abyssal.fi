'use client';
import { type FC, type ReactNode, useMemo } from 'react';
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
  NightlyWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import { SOLANA_RPC } from '@/lib/constants';

interface Props { children: ReactNode; }

export const WalletContextProvider: FC<Props> = ({ children }) => {
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter({ network: WalletAdapterNetwork.Devnet }),
    new CoinbaseWalletAdapter(),
    new TrustWalletAdapter(),
    new LedgerWalletAdapter(),
    new BitgetWalletAdapter(),
    new Coin98WalletAdapter(),
    new NightlyWalletAdapter(),
  ], []);

  return (
    <ConnectionProvider endpoint={SOLANA_RPC}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        {children}
      </WalletProvider>
    </ConnectionProvider>
  );
};
