/**
 * Try to close vault_usdc via reset_vault first (drains + zeroes), then migrate.
 * reset_vault DOESN'T close the account — but it might reset internal bookkeeping.
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

  const authUsdp = await getOrCreateAssociatedTokenAccount(conn, auth, USDP, auth.publicKey);

  console.log('calling resetVault...');
  const sig = await program.methods.resetVault().accounts({
    vault, usdcVault: vaultUsdc, authorityUsdc: authUsdp.address,
    authority: auth.publicKey, tokenProgram: TOKEN_PROGRAM_ID,
  } as any).rpc();
  console.log('  reset_vault tx:', sig);

  const v: any = await (program.account as any).optionVault.fetch(vault);
  console.log('after reset: total_collateral:', v.totalCollateral.toString(),
              'open_interest:', v.openInterest.toString(),
              'delta_net:', v.deltaNet.toString());
}
main().catch(e => { console.error(e.message ?? e); process.exit(1); });
