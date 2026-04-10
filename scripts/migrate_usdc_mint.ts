/**
 * Migrate vault USDC mint from old HC53kut... to Pacifica USDP mint.
 *
 * Two-step process:
 *   1. Close old vault_usdc token account + update vault.usdc_mint
 *   2. Re-create vault_usdc token account for the new mint
 *
 * Usage:
 *   npx ts-node scripts/migrate_usdc_mint.ts
 */
import * as anchor from '@coral-xyz/anchor';
import { AnchorProvider, Program, web3 } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { PacificaOptions } from '../target/types/pacifica_options';

const IDL = require('../target/idl/pacifica_options.json');

const PROGRAM_ID     = new PublicKey('CBkvR8SeN6j8RQKB7dSxG3dza2v71XHmWEe8LgfMW1hG');
const NEW_USDC_MINT  = new PublicKey('USDPqRbLidFGufty2s3oizmDEKdqx7ePTqzDMbf5ZKM'); // Pacifica USDP
const RPC_URL        = 'https://api.devnet.solana.com';

function vaultPDA(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), authority.toBuffer()],
    PROGRAM_ID,
  );
}

function vaultUsdcPDA(vault: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vault_usdc'), vault.toBuffer()],
    PROGRAM_ID,
  );
}

async function main() {
  const keypairPath = path.resolve(os.homedir(), '.config/solana/vault_authority.json');
  if (!fs.existsSync(keypairPath)) {
    throw new Error(`Keypair not found at ${keypairPath}`);
  }
  const raw = JSON.parse(fs.readFileSync(keypairPath, 'utf8'));
  const authority = Keypair.fromSecretKey(Uint8Array.from(raw));

  const connection = new Connection(RPC_URL, 'confirmed');
  const wallet = new anchor.Wallet(authority);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });
  anchor.setProvider(provider);

  const program = new Program<PacificaOptions>(IDL, provider);

  const [vault] = vaultPDA(authority.publicKey);
  const [vaultUsdc] = vaultUsdcPDA(vault);

  console.log('═══════════════════════════════════════════════');
  console.log('  Migrate Vault USDC Mint');
  console.log('═══════════════════════════════════════════════');
  console.log(`  Authority  : ${authority.publicKey.toBase58()}`);
  console.log(`  Vault PDA  : ${vault.toBase58()}`);
  console.log(`  Vault USDC : ${vaultUsdc.toBase58()}`);
  console.log(`  New mint   : ${NEW_USDC_MINT.toBase58()}`);
  console.log('───────────────────────────────────────────────\n');

  // Check current vault state
  const vaultState = await (program.account as any).optionVault.fetch(vault);
  console.log(`  Current usdc_mint: ${vaultState.usdcMint.toBase58()}`);

  if (vaultState.usdcMint.toBase58() === NEW_USDC_MINT.toBase58()) {
    console.log('\n  Already migrated! Nothing to do.');
    return;
  }

  // Step 0: Empty the vault if it has tokens (required before closing)
  const vaultUsdcBal = await connection.getTokenAccountBalance(vaultUsdc);
  if (parseInt(vaultUsdcBal.value.amount) > 0) {
    console.log(`\n[0/3] Vault has ${vaultUsdcBal.value.uiAmountString} old tokens — resetting vault first...`);

    // Ensure authority has an ATA for the old mint
    const oldMint = vaultState.usdcMint as PublicKey;
    const authorityAta = await getAssociatedTokenAddress(oldMint, authority.publicKey);
    const ataInfo = await connection.getAccountInfo(authorityAta);
    if (!ataInfo) {
      console.log('  Creating authority ATA for old mint...');
      const createAtaIx = createAssociatedTokenAccountInstruction(
        authority.publicKey, authorityAta, authority.publicKey, oldMint,
      );
      const tx0 = new web3.Transaction().add(createAtaIx);
      const sig0 = await provider.sendAndConfirm(tx0);
      console.log(`  ✓ ATA created: ${sig0}`);
    }

    const txReset = await program.methods
      .resetVault()
      .accounts({
        vault,
        usdcVault: vaultUsdc,
        authorityUsdc: authorityAta,
        authority: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .rpc();
    console.log(`  ✓ Vault reset. tx: ${txReset}`);
    await connection.confirmTransaction(txReset, 'confirmed');
  }

  // Step 1: Close old vault_usdc + update usdc_mint
  console.log('\n[1/3] Closing old vault_usdc + updating usdc_mint...');
  const tx1 = await program.methods
    .migrateUsdcMintClose()
    .accounts({
      vault,
      oldUsdcVault: vaultUsdc,
      newUsdcMint: NEW_USDC_MINT,
      authority: authority.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
    } as any)
    .rpc();
  console.log(`  ✓ Step 1 done. tx: ${tx1}`);

  await connection.confirmTransaction(tx1, 'confirmed');
  console.log('  ✓ Confirmed\n');

  // Step 2: Re-create vault_usdc with new mint
  console.log('[2/3] Re-creating vault_usdc with Pacifica USDP mint...');
  const tx2 = await program.methods
    .reinitVaultUsdc()
    .accounts({
      vault,
      usdcVault: vaultUsdc,
      newUsdcMint: NEW_USDC_MINT,
      authority: authority.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: web3.SystemProgram.programId,
      rent: web3.SYSVAR_RENT_PUBKEY,
    } as any)
    .rpc();
  console.log(`  ✓ Step 2 done. tx: ${tx2}`);

  // Verify
  const newState = await (program.account as any).optionVault.fetch(vault);
  console.log('\n═══════════════════════════════════════════════');
  console.log('  Migration complete!');
  console.log(`  New usdc_mint : ${newState.usdcMint.toBase58()}`);
  console.log(`  New usdc_vault: ${newState.usdcVault.toBase58()}`);
  console.log('═══════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('\n[ERROR]', err.message ?? err);
  process.exit(1);
});
