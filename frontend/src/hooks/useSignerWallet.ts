'use client';

import { useCallback, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Connection, Transaction } from '@solana/web3.js';
import { PRIVY_ENABLED } from '@/components/WalletProvider';
import { useEffectiveWallet } from './useEffectiveWallet';
import { useWallets, useSignTransaction } from '@privy-io/react-auth/solana';

/**
 * Internal: Privy-backed signer (only rendered when PRIVY_ENABLED).
 * Uses static imports — safe because it's only called inside PrivyProvider.
 */
function usePrivySigner() {
  const { wallets } = useWallets();
  const { signTransaction: privySignTx } = useSignTransaction();
  return { privyWallets: wallets, privySignTx };
}

/** Dummy for non-Privy mode */
function useNoopSigner() {
  return { privyWallets: [] as any[], privySignTx: null as any };
}

/**
 * Returns a wallet-like object that can sign transactions.
 * Works with both Privy and native adapter — no require() needed.
 */
export function useSignerWallet() {
  const { publicKey } = useEffectiveWallet();
  const adapterWallet = useWallet();

  // PRIVY_ENABLED is a module-level constant — hook order is deterministic
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { privyWallets, privySignTx } = PRIVY_ENABLED ? usePrivySigner() : useNoopSigner();

  const signTransaction = useCallback(async (tx: Transaction): Promise<Transaction> => {
    // Try adapter first (has native signTransaction)
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
