/**
 * reset_vault.ts — Drain all USDC from the vault back to the authority
 * and zero the vLP accounting counters.
 *
 * Run AFTER `anchor deploy --provider.cluster devnet`:
 *   npx ts-node scripts/reset_vault.ts
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
const USDC_MINT  = new PublicKey('HC53kut48rC2raro2XkuzmQD1g4MA3XgDK1HtfCfXf6k');
const RPC_URL    = 'https://api.devnet.solana.com';

async function main() {
  const keypairPath = path.resolve(os.homedir(), '.config/solana/vault_authority.json');
  const authority   = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf8'))),
  );

  const connection = new Connection(RPC_URL, 'confirmed');
  const wallet     = new anchor.Wallet(authority);
  const provider   = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  anchor.setProvider(provider);

  const program = new Program<PacificaOptions>(IDL, provider);

  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), authority.publicKey.toBuffer()],
    PROGRAM_ID,
  );
  const [vaultUsdc] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_usdc'), vault.toBuffer()],
    PROGRAM_ID,
  );

  // Get or create the authority's USDC ATA (receives drained USDC)
  const authorityUsdc = await getOrCreateAssociatedTokenAccount(
    connection,
    authority,
    USDC_MINT,
    authority.publicKey,
  );

  // Current vault state
  const vaultState = await (program.account as any).optionVault.fetch(vault);
  const usdcInfo   = await connection.getTokenAccountBalance(vaultUsdc);
  console.log('Vault USDC balance:', usdcInfo.value.uiAmount);
  console.log('total_vlp_tokens :', vaultState.totalVlpTokens.toString());

  const sig = await program.methods
    .resetVault()
    .accounts({
      vault,
      usdcVault:     vaultUsdc,
      authorityUsdc: authorityUsdc.address,
      authority:     authority.publicKey,
      tokenProgram:  TOKEN_PROGRAM_ID,
    } as any)
    .rpc();

  console.log('\n✓ Vault reset. tx:', sig);
  console.log('  USDC returned to:', authorityUsdc.address.toBase58());

  const after = await (program.account as any).optionVault.fetch(vault);
  console.log('  total_collateral :', after.totalCollateral.toString());
  console.log('  total_vlp_tokens :', after.totalVlpTokens.toString());
}

main().catch(e => { console.error(e.message ?? e); process.exit(1); });
