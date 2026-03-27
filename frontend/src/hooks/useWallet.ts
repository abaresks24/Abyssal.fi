'use client';
import { useWallet as useSolanaWallet, useConnection } from '@solana/wallet-adapter-react';
import { useCallback, useState, useEffect } from 'react';
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';
import { USDC_MINT } from '@/lib/constants';

/**
 * Extended wallet hook that adds USDC balance and utility methods.
 */
export function useWallet() {
  const wallet = useSolanaWallet();
  const { connection } = useConnection();

  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [loadingBalances, setLoadingBalances] = useState(false);

  const fetchBalances = useCallback(async () => {
    if (!wallet.publicKey) {
      setSolBalance(null);
      setUsdcBalance(null);
      return;
    }

    setLoadingBalances(true);
    try {
      // SOL balance
      const lamports = await connection.getBalance(wallet.publicKey);
      setSolBalance(lamports / LAMPORTS_PER_SOL);

      // USDC balance
      try {
        const usdcMint = new PublicKey(USDC_MINT);
        const ata = await getAssociatedTokenAddress(usdcMint, wallet.publicKey);
        const tokenAccount = await getAccount(connection, ata);
        // USDC has 6 decimals
        setUsdcBalance(Number(tokenAccount.amount) / 1_000_000);
      } catch {
        // ATA doesn't exist → 0 balance
        setUsdcBalance(0);
      }
    } catch (err) {
      console.error('Failed to fetch balances:', err);
    } finally {
      setLoadingBalances(false);
    }
  }, [wallet.publicKey, connection]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  const formatAddress = (addr?: string | null): string => {
    if (!addr) return '';
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
  };

  const shortenedAddress = wallet.publicKey
    ? formatAddress(wallet.publicKey.toString())
    : null;

  return {
    ...wallet,
    solBalance,
    usdcBalance,
    loadingBalances,
    fetchBalances,
    shortenedAddress,
    isConnected: !!wallet.publicKey,
    formatAddress,
  };
}
