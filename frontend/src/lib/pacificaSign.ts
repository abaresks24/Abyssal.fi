/**
 * Pacifica API signing helper.
 *
 * Pacifica uses Solana ed25519 signatures on canonicalized JSON:
 *   1. Build header: { timestamp, expiry_window, type }
 *   2. Merge with data: { ...header, data: operationData }
 *   3. Recursively sort JSON keys alphabetically at every level
 *   4. Serialize as compact JSON (no whitespace)
 *   5. ed25519 sign with Solana keypair
 *   6. Base58-encode signature
 *   7. Flatten operationData into final body: { account, signature, timestamp, ...opData }
 *
 * Docs: https://pacifica.gitbook.io/docs/api-documentation/api
 */
import nacl from 'tweetnacl';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const _bs58 = require('bs58');
// bs58 v6 is ESM-only; require() may expose the API under .default.
const bs58 = (typeof _bs58.encode === 'function' ? _bs58 : _bs58.default) as {
  encode(b: Uint8Array): string;
  decode(s: string): Uint8Array;
};
import { Keypair } from '@solana/web3.js';

type OpType =
  | 'create_order'
  | 'create_market_order'
  | 'cancel_order'
  | 'cancel_all_orders'
  | 'update_leverage'
  | 'withdraw';

function sortKeys(v: any): any {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v !== null && typeof v === 'object') {
    const out: any = {};
    for (const k of Object.keys(v).sort()) out[k] = sortKeys(v[k]);
    return out;
  }
  return v;
}

/**
 * Sign a Pacifica API request.
 *
 * Two modes:
 *   - Main wallet: signer = main wallet, account = main.pubkey, agent_wallet = null
 *   - Agent wallet: signer = agent, account = main wallet pubkey, agent_wallet = agent.pubkey
 *     (Preferred — agent can sign orders on behalf of main account without
 *      having access to main wallet's custody.)
 */
export function signPacificaRequest(
  signer: Keypair,
  opType: OpType,
  operationData: Record<string, any>,
  opts: { mainAccount?: string; expiryWindowMs?: number } = {},
) {
  const expiryWindowMs = opts.expiryWindowMs ?? 30_000;
  const mainAccount = opts.mainAccount ?? signer.publicKey.toBase58();
  const isAgent = mainAccount !== signer.publicKey.toBase58();

  const timestamp = Date.now();
  const header = { timestamp, expiry_window: expiryWindowMs, type: opType };
  const toSign = { ...header, data: operationData };
  const sorted = sortKeys(toSign);
  const compact = JSON.stringify(sorted);
  const msg = new TextEncoder().encode(compact);
  const sig = nacl.sign.detached(msg, signer.secretKey);
  const signatureB58 = bs58.encode(sig);
  return {
    account: mainAccount,
    agent_wallet: isAgent ? signer.publicKey.toBase58() : null,
    signature: signatureB58,
    timestamp,
    expiry_window: expiryWindowMs,
    ...operationData,
  };
}

const PACIFICA_BASE = (process.env.PACIFICA_API_BASE_URL || 'https://api.pacifica.fi/api') + '/v1';

/** Place a market order on Pacifica. `mainAccount` only needed for agent-wallet mode. */
export async function placeMarketOrder(
  signer: Keypair,
  params: {
    symbol: string;
    side: 'bid' | 'ask';
    amount: string;
    slippagePercent?: string;
    reduceOnly?: boolean;
    mainAccount?: string;
  },
): Promise<{ order_id: number } | { error: string }> {
  const body = signPacificaRequest(signer, 'create_market_order', {
    symbol: params.symbol,
    side: params.side,
    amount: params.amount,
    slippage_percent: params.slippagePercent ?? '1',
    reduce_only: params.reduceOnly ?? false,
  }, { mainAccount: params.mainAccount });
  const res = await fetch(`${PACIFICA_BASE}/orders/create_market`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    return { error: `${res.status}: ${text.slice(0, 200)}` };
  }
  return res.json();
}

/** Get current open positions. */
export async function getPositions(accountPubkey: string) {
  const res = await fetch(`${PACIFICA_BASE}/positions?account=${accountPubkey}`, {
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const json = await res.json();
  return (json.data ?? json) as Array<{
    symbol: string;
    side: 'bid' | 'ask';
    amount: string;
    entry_price: string;
    margin: string;
    funding: string;
    isolated: boolean;
    created_at: number;
    updated_at: number;
  }>;
}

/** Get account info (balance, equity, available). */
export async function getAccountInfo(accountPubkey: string) {
  const res = await fetch(`${PACIFICA_BASE}/account?account=${accountPubkey}`, {
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.data ?? json;
}
