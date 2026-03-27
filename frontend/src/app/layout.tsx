import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { WalletContextProvider } from '@/components/WalletProvider';

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Abyssal.fi | On-Chain Options',
  description:
    'Decentralized options market on Solana — IV derived from on-chain data, 0.05% fees.',
  keywords: ['DeFi', 'options', 'Solana', 'derivatives', 'AMM'],
  openGraph: {
    title: 'Abyssal.fi',
    description: 'On-chain European options on Solana',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${mono.variable}`}>
      <body className="bg-background text-foreground antialiased min-h-screen">
        <WalletContextProvider>{children}</WalletContextProvider>
      </body>
    </html>
  );
}
