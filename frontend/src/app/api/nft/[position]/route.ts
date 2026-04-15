/**
 * NFT metadata endpoint — serves rich JSON for an option NFT.
 * Reads the on-chain OptionPosition + IVOracle state so the info is always
 * fresh (strike, premium_paid, created_at, market, option_type, expiry).
 *
 * Wallets/marketplaces fetch this URI from Metaplex on-chain metadata.
 */
import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import IDL from '@/lib/pacifica_options_idl.json';

const SOLANA_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey('CBkvR8SeN6j8RQKB7dSxG3dza2v71XHmWEe8LgfMW1hG');
const SCALE = 1_000_000;

const MARKET_LABEL = ['BTC','ETH','SOL','NVDA','TSLA','PLTR','CRCL','HOOD','SP500','XAU','XAG','PAXG','PLAT','NATGAS','COPPER'];

export async function GET(_req: NextRequest, { params }: { params: { position: string } }) {
  try {
    const positionPk = new PublicKey(params.position);
    const conn = new Connection(SOLANA_RPC, 'confirmed');
    const dummy = { publicKey: PublicKey.default, signTransaction: async (t: any) => t, signAllTransactions: async (t: any[]) => t };
    const provider = new AnchorProvider(conn, dummy as any, { commitment: 'confirmed' });
    const program = new Program(IDL as any, provider);

    const p: any = await (program.account as any).optionPosition.fetch(positionPk);

    const marketIdx = typeof p.market === 'object' ? Object.keys(p.market)[0] : p.market;
    const marketLabel = typeof marketIdx === 'string' ? marketIdx.toUpperCase() : (MARKET_LABEL[marketIdx] ?? 'UNK');
    const optionType  = p.optionType?.call !== undefined || p.optionType?.Call !== undefined ? 'CALL' : 'PUT';
    const strike      = (p.strike as BN).toNumber() / SCALE;
    const expiry      = (p.expiry as BN).toNumber();
    const premiumPaid = (p.premiumPaid as BN).toNumber() / SCALE;
    const createdAt   = (p.createdAt as BN).toNumber();
    const entryIv     = (p.entryIv as BN).toNumber() / SCALE;
    const entryDelta  = (p.entryDelta as any).toNumber ? (p.entryDelta as any).toNumber() / SCALE : 0;
    const size        = (p.size as BN).toNumber() / SCALE;
    const settled     = !!p.settled;
    const payoffRecv  = (p.payoffReceived as BN).toNumber() / SCALE;

    const expiryISO   = new Date(expiry * 1000).toISOString();
    const createdISO  = new Date(createdAt * 1000).toISOString();

    const name = `ABYSSAL ${marketLabel} ${optionType} $${Math.round(strike)}`;
    const description = [
      `European ${optionType.toLowerCase()} option on ${marketLabel}, strike $${strike}, expires ${expiryISO}.`,
      `Premium paid: $${premiumPaid.toFixed(2)} on ${createdISO}.`,
      `Entry IV: ${(entryIv * 100).toFixed(1)}%, entry delta: ${entryDelta.toFixed(3)}.`,
      settled ? `Position settled. Payoff received: $${payoffRecv.toFixed(2)}.` : 'Position open.',
    ].join(' ');

    const json = {
      name,
      symbol: 'ABYS',
      description,
      image: 'https://abyssal-fi.vercel.app/logo.svg',
      external_url: 'https://abyssal-fi.vercel.app',
      attributes: [
        { trait_type: 'Market',         value: marketLabel },
        { trait_type: 'Type',           value: optionType },
        { trait_type: 'Strike',         value: strike },
        { trait_type: 'Size',           value: size },
        { trait_type: 'Premium Paid',   value: premiumPaid },
        { trait_type: 'Entry IV (%)',   value: (entryIv * 100).toFixed(2) },
        { trait_type: 'Entry Delta',    value: entryDelta.toFixed(4) },
        { trait_type: 'Created (UTC)',  value: createdISO },
        { trait_type: 'Expires (UTC)',  value: expiryISO },
        { trait_type: 'Settled',        value: settled ? 'Yes' : 'No' },
        ...(settled ? [{ trait_type: 'Payoff Received', value: payoffRecv }] : []),
      ],
      properties: {
        category: 'image',
        files: [{ uri: 'https://abyssal-fi.vercel.app/logo.svg', type: 'image/svg+xml' }],
      },
    };

    return NextResponse.json(json, {
      headers: {
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Failed to load position' }, { status: 404 });
  }
}
