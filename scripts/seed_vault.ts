/**
 * Seed the vault with USDP liquidity using the faucet filler wallet.
 *
 *   npx ts-node scripts/seed_vault.ts [amount_usdp=50000]
 */
import * as anchor from '@coral-xyz/anchor';
import { AnchorProvider, Program, BN } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount, getAssociatedTokenAddress,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';
import type { PacificaOptions } from '../target/types/pacifica_options';
const IDL = require('../target/idl/pacifica_options.json');

const PROGRAM_ID = new PublicKey('CBkvR8SeN6j8RQKB7dSxG3dza2v71XHmWEe8LgfMW1hG');
const VAULT_AUTH = new PublicKey('AHWUeGsXbx9gd46SBS5SQK4rfQ8rGb1wWAzvZtJ6zdRg');
const USDP       = new PublicKey('USDPqRbLidFGufty2s3oizmDEKdqx7ePTqzDMbf5ZKM');
const VLP_MINT   = new PublicKey('4swq2n3c9SeJHRLvz6NcuYkUVwxGVPgF5m2ELzAHPzzU');

const AMOUNT = parseFloat(process.argv[2] || '50000');

function loadFiller(): Keypair {
  const envPath = path.resolve(__dirname, '../frontend/.env.local');
  const env = fs.readFileSync(envPath, 'utf8');
  const m = env.match(/FILLER_KEYPAIR=(\[[^\]]+\])/);
  if (!m) throw new Error('FILLER_KEYPAIR not found in frontend/.env.local');
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(m[1])));
}

async function main() {
  const filler = loadFiller();
  console.log('filler:', filler.publicKey.toBase58());

  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  const provider = new AnchorProvider(connection, new anchor.Wallet(filler), { commitment: 'confirmed' });
  anchor.setProvider(provider);
  const program = new Program<PacificaOptions>(IDL, provider);

  const [vault] = PublicKey.findProgramAddressSync([Buffer.from('vault'), VAULT_AUTH.toBuffer()], PROGRAM_ID);
  const [vaultUsdc] = PublicKey.findProgramAddressSync([Buffer.from('vault_usdc'), vault.toBuffer()], PROGRAM_ID);
  const [lpPos] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_lp_position'), filler.publicKey.toBuffer(), vault.toBuffer()],
    PROGRAM_ID,
  );

  const fillerUsdp = await getOrCreateAssociatedTokenAccount(connection, filler, USDP, filler.publicKey);
  console.log('filler USDP balance:', (await connection.getTokenAccountBalance(fillerUsdp.address)).value.uiAmount);

  const fillerVlp = await getAssociatedTokenAddress(VLP_MINT, filler.publicKey);
  const usdcIn = new BN(Math.round(AMOUNT * 1e6));
  console.log(`depositing ${AMOUNT} USDP into vault...`);

  const sig = await program.methods
    .depositVault({ usdcAmount: usdcIn, minVlpTokens: new BN(0) } as any)
    .accounts({
      vault,
      usdcVault: vaultUsdc,
      vlpMint: VLP_MINT,
      depositorVlp: fillerVlp,
      depositorUsdc: fillerUsdp.address,
      lpPosition: lpPos,
      depositor: filler.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    } as any)
    .rpc();

  console.log('  tx:', sig);
  console.log('  vault_usdc now:', (await connection.getTokenAccountBalance(vaultUsdc)).value.uiAmount, 'USDP');
}
main().catch(e => { console.error(e.message ?? e); process.exit(1); });
