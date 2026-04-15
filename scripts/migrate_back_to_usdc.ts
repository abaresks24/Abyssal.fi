/**
 * Migrate the USDP vault back to HC53 USDC (we control this mint).
 *   npx ts-node scripts/migrate_back_to_usdc.ts
 */
import * as anchor from '@coral-xyz/anchor';
import { AnchorProvider, Program, web3 } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { PacificaOptions } from '../target/types/pacifica_options';
const IDL = require('../target/idl/pacifica_options.json');

const PROGRAM_ID = new PublicKey('CBkvR8SeN6j8RQKB7dSxG3dza2v71XHmWEe8LgfMW1hG');
const NEW_MINT   = new PublicKey('HC53kut48rC2raro2XkuzmQD1g4MA3XgDK1HtfCfXf6k');

async function main() {
  // usdp_authority owns the vault currently
  const auth = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(path.resolve(os.homedir(), '.config/solana/usdp_authority.json'), 'utf8'))),
  );
  const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
  const provider = new AnchorProvider(conn, new anchor.Wallet(auth), { commitment: 'confirmed' });
  anchor.setProvider(provider);
  const program = new Program<PacificaOptions>(IDL, provider);

  const [vault]     = PublicKey.findProgramAddressSync([Buffer.from('vault'), auth.publicKey.toBuffer()], PROGRAM_ID);
  const [vaultUsdc] = PublicKey.findProgramAddressSync([Buffer.from('vault_usdc'), vault.toBuffer()], PROGRAM_ID);

  const v: any = await (program.account as any).optionVault.fetch(vault);
  console.log('current usdc_mint:', v.usdcMint.toBase58());
  if (v.usdcMint.toBase58() === NEW_MINT.toBase58()) {
    console.log('Already HC53. Done.');
    return;
  }

  const bal = await conn.getTokenAccountBalance(vaultUsdc);
  console.log('vault_usdc balance (must be 0):', bal.value.uiAmount);

  console.log('[1/2] migrate_usdc_mint_close...');
  const tx1 = await program.methods.migrateUsdcMintClose().accounts({
    vault, oldUsdcVault: vaultUsdc, newUsdcMint: NEW_MINT,
    authority: auth.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
  } as any).rpc();
  console.log('  tx:', tx1);
  await conn.confirmTransaction(tx1, 'confirmed');

  console.log('[2/2] reinit_vault_usdc...');
  const tx2 = await program.methods.reinitVaultUsdc().accounts({
    vault, usdcVault: vaultUsdc, newUsdcMint: NEW_MINT,
    authority: auth.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: web3.SystemProgram.programId, rent: web3.SYSVAR_RENT_PUBKEY,
  } as any).rpc();
  console.log('  tx:', tx2);

  const after: any = await (program.account as any).optionVault.fetch(vault);
  console.log('\n✓ migrated. new usdc_mint:', after.usdcMint.toBase58());
}
main().catch(e => { console.error(e.message ?? e); process.exit(1); });
