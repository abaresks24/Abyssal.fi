/**
 * Rollback vault from HC53 USDC back to USDP.
 * Must be run when vault_usdc is empty (we drain first via reset_vault).
 *   npx ts-node scripts/rollback_to_usdp.ts
 */
import * as anchor from '@coral-xyz/anchor';
import { AnchorProvider, Program, web3 } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount } from '@solana/spl-token';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { PacificaOptions } from '../target/types/pacifica_options';
const IDL = require('../target/idl/pacifica_options.json');

const PROGRAM_ID = new PublicKey('CBkvR8SeN6j8RQKB7dSxG3dza2v71XHmWEe8LgfMW1hG');
const USDP       = new PublicKey('USDPqRbLidFGufty2s3oizmDEKdqx7ePTqzDMbf5ZKM');
const HC53       = new PublicKey('HC53kut48rC2raro2XkuzmQD1g4MA3XgDK1HtfCfXf6k');

async function main() {
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
  if (v.usdcMint.toBase58() === USDP.toBase58()) { console.log('Already USDP.'); return; }

  // Step 1: drain any USDC via reset_vault (returns USDC to authority ATA)
  const bal = await conn.getTokenAccountBalance(vaultUsdc);
  console.log('vault balance:', bal.value.uiAmount, 'HC53 USDC');
  if (parseInt(bal.value.amount) > 0) {
    console.log('[0] draining via reset_vault...');
    const authAta = await getOrCreateAssociatedTokenAccount(conn, auth, HC53, auth.publicKey);
    const tx0 = await program.methods.resetVault().accounts({
      vault, usdcVault: vaultUsdc, authorityUsdc: authAta.address,
      authority: auth.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
    } as any).rpc();
    console.log('  tx:', tx0);
  }

  console.log('[1] migrate_usdc_mint_close → USDP...');
  const tx1 = await program.methods.migrateUsdcMintClose().accounts({
    vault, oldUsdcVault: vaultUsdc, newUsdcMint: USDP,
    authority: auth.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
  } as any).rpc();
  console.log('  tx:', tx1);
  await conn.confirmTransaction(tx1, 'confirmed');

  console.log('[2] reinit_vault_usdc...');
  const tx2 = await program.methods.reinitVaultUsdc().accounts({
    vault, usdcVault: vaultUsdc, newUsdcMint: USDP,
    authority: auth.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: web3.SystemProgram.programId, rent: web3.SYSVAR_RENT_PUBKEY,
  } as any).rpc();
  console.log('  tx:', tx2);

  const after: any = await (program.account as any).optionVault.fetch(vault);
  console.log('\n✓ rolled back. usdc_mint:', after.usdcMint.toBase58());
}
main().catch(e => { console.error(e.message ?? e); process.exit(1); });
