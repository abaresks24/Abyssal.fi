'use client';

import { useCallback, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Connection, Transaction } from '@solana/web3.js';
import { PRIVY_ENABLED } from '@/components/WalletProvider';
import { useEffectiveWallet } from './useEffectiveWallet';

let usePrivyHooks: { useWallets: any; useSignTransaction: any } | null = null;
if (PRIVY_ENABLED) {
  try {
    const privySolana = require('@privy-io/react-auth/solana');
    usePrivyHooks = {
      useWallets: privySolana.useWallets,
      useSignTransaction: privySolana.useSignTransaction,
    };
  } catch {}
}

/**
 * Returns a wallet-like object that can sign transactions.
 * Works with both Privy and native adapter.
 * Use this instead of raw useWallet() when you need to sign transactions
 * and the user might be connected via Privy.
 */
export function useSignerWallet() {
  const { publicKey } = useEffectiveWallet();
  const adapterWallet = useWallet();

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const privyWallets = PRIVY_ENABLED && usePrivyHooks ? usePrivyHooks.useWallets().wallets : [];
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const privySignTx = PRIVY_ENABLED && usePrivyHooks ? usePrivyHooks.useSignTransaction().signTransaction : null;

  const signTransaction = useCallback(async (tx: Transaction): Promise<Transaction> => {
    // Try adapter first
    if (adapterWallet.publicKey && adapterWallet.signTransaction) {
      return adapterWallet.signTransaction(tx);
    }

    // Fall back to Privy
    if (privyWallets.length > 0 && privySignTx) {
      const privyWallet = privyWallets[0];
      tx.feePayer = new PublicKey(privyWallet.address);
      const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
      const { signedTransaction } = await privySignTx({
        transaction: serialized,
        wallet: privyWallet,
        chain: 'solana:devnet',
      });
      return Transaction.from(Buffer.from(signedTransaction));
    }

    throw new Error('No wallet available for signing');
  }, [adapterWallet.publicKey, adapterWallet.signTransaction, privyWallets, privySignTx]);

  const sendTransaction = useCallback(async (tx: Transaction, connection: Connection): Promise<string> => {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = publicKey!;

    const signed = await signTransaction(tx);
    const raw = signed.serialize();

    const sig = await connection.sendRawTransaction(raw, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    return sig;
  }, [publicKey, signTransaction]);

  // Build a wallet-like object compatible with PacificaOptionsClient
  const walletForClient = useMemo(() => ({
    publicKey,
    signTransaction,
    signAllTransactions: async (txs: Transaction[]) => {
      const signed = [];
      for (const tx of txs) signed.push(await signTransaction(tx));
      return signed;
    },
    sendTransaction,
    connected: !!publicKey,
    connecting: false,
    disconnecting: false,
    disconnect: adapterWallet.disconnect,
    select: adapterWallet.select,
    wallet: adapterWallet.wallet,
    wallets: adapterWallet.wallets,
  }), [publicKey, signTransaction, sendTransaction, adapterWallet]);

  return {
    publicKey,
    signTransaction,
    sendTransaction,
    walletForClient,
    ready: !!publicKey,
  };
}
