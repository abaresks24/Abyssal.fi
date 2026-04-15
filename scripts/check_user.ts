import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import IDL from '../frontend/src/lib/pacifica_options_idl.json';

const USER = new PublicKey('9cNdqo8hi5eAmTZVw3AbLb3z8wGngM5hztjEWdTaYXLX');
const PROGRAM_ID = new PublicKey('CBkvR8SeN6j8RQKB7dSxG3dza2v71XHmWEe8LgfMW1hG');

async function main() {
  const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
  const dummy = { publicKey: PublicKey.default, signTransaction: async (t: any) => t, signAllTransactions: async (t: any[]) => t };
  const provider = new AnchorProvider(conn, dummy as any, { commitment: 'confirmed' });
  const program = new Program(IDL as any, provider);

  console.log('SOL:', (await conn.getBalance(USER)) / 1e9);

  // All OptionPositions owned by user (owner at offset 9)
  const positions = await (program.account as any).optionPosition.all([
    { memcmp: { offset: 9, bytes: USER.toBase58() } },
  ]);
  console.log(`\n${positions.length} OptionPosition(s):`);
  for (const p of positions) {
    const a: any = p.account;
    const size = a.size?.toNumber?.() ?? 0;
    const strike = a.strike?.toNumber?.() / 1e6;
    const expiry = a.expiry?.toNumber?.();
    const expiryDate = new Date(expiry * 1000).toISOString();
    const optType = a.optionType?.call !== undefined ? 'call' : 'put';
    const settled = a.settled;
    const premium = a.premiumPaid?.toNumber?.() / 1e6;
    console.log(`  ${p.publicKey.toBase58().slice(0,12)}... | ${optType} @ $${strike} | expiry ${expiryDate} | size=${size/1e6} | premium=$${premium} | settled=${settled}`);
  }

  // Last 10 signatures
  const sigs = await conn.getSignaturesForAddress(USER, { limit: 10 });
  console.log(`\nLast ${sigs.length} txs:`);
  for (const s of sigs.slice(0, 10)) {
    const status = s.err ? 'ERR ' + JSON.stringify(s.err).slice(0,60) : 'OK';
    console.log(`  ${s.signature.slice(0,16)}... | slot ${s.slot} | ${status}`);
  }
}
main().catch(console.error);
