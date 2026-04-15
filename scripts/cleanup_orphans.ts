/**
 * Close all orphan OptionPosition (size=0) and AmmPool (zero reserves) PDAs.
 *   npx ts-node scripts/cleanup_orphans.ts
 *
 * Uses vault_authority as signer for AmmPools. Position cleanup requires
 * the owner's signature — this script only closes those owned by the authority.
 * Users must close their own orphans via the UI burn helper or by calling
 * close_orphan_position from their wallet.
 */
import * as anchor from '@coral-xyz/anchor';
import { AnchorProvider, Program, BN } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { PacificaOptions } from '../target/types/pacifica_options';
const IDL = require('../target/idl/pacifica_options.json');

const PROGRAM_ID = new PublicKey('CBkvR8SeN6j8RQKB7dSxG3dza2v71XHmWEe8LgfMW1hG');

async function main() {
  const auth = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(path.resolve(os.homedir(), '.config/solana/usdp_authority.json'), 'utf8'))),
  );
  const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
  const provider = new AnchorProvider(conn, new anchor.Wallet(auth), { commitment: 'confirmed' });
  anchor.setProvider(provider);
  const program = new Program<PacificaOptions>(IDL, provider);

  const [vault] = PublicKey.findProgramAddressSync([Buffer.from('vault'), auth.publicKey.toBuffer()], PROGRAM_ID);

  // Fetch all AmmPool accounts
  // AmmPool layout: [disc 8][bump 1][vault 32]... → vault at offset 9
  const pools = await (program.account as any).ammPool.all([
    { memcmp: { offset: 9, bytes: vault.toBase58() } },
  ]);
  console.log(`found ${pools.length} AmmPool accounts`);

  let closedPools = 0;
  for (const p of pools) {
    const a: any = p.account;
    const ro = a.reserveOptions?.toNumber?.() ?? Number(a.reserveOptions ?? 0);
    const ru = a.reserveUsdc?.toNumber?.()    ?? Number(a.reserveUsdc ?? 0);
    const lp = a.totalLpTokens?.toNumber?.()  ?? Number(a.totalLpTokens ?? 0);
    if (ro === 0 && ru === 0 && lp === 0) {
      try {
        const sig = await program.methods.closeOrphanAmmPool().accounts({
          vault, ammPool: p.publicKey, authority: auth.publicKey,
        } as any).rpc();
        console.log(`  ✓ closed ${p.publicKey.toBase58().slice(0,8)}... tx:${sig.slice(0,12)}...`);
        closedPools++;
      } catch (e: any) {
        console.log(`  ✗ ${p.publicKey.toBase58().slice(0,8)}...: ${e?.message?.slice(0,80)}`);
      }
    }
  }
  console.log(`Closed ${closedPools} orphan AmmPool(s).`);

  // Positions: we can only close those where the owner is our authority.
  // Users must use the UI helper to close their own orphan positions.
  // OptionPosition layout: [disc 8][bump 1][owner 32]... → owner at offset 9
  const positions = await (program.account as any).optionPosition.all([
    { memcmp: { offset: 9, bytes: auth.publicKey.toBase58() } },
  ]);
  console.log(`\nfound ${positions.length} OptionPosition owned by authority`);
  for (const p of positions) {
    const size = p.account.size?.toNumber?.() ?? Number(p.account.size ?? 0);
    if (size === 0) {
      try {
        const sig = await program.methods.closeOrphanPosition().accounts({
          position: p.publicKey, owner: auth.publicKey,
        } as any).rpc();
        console.log(`  ✓ closed position ${p.publicKey.toBase58().slice(0,8)}...`);
      } catch (e: any) {
        console.log(`  ✗ ${e?.message?.slice(0,80)}`);
      }
    }
  }
}
main().catch(e => { console.error(e.message ?? e); process.exit(1); });
