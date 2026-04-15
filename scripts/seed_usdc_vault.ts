/**
 * Mint USDC (HC53...) to filler AND to vault.
 *   npx ts-node scripts/seed_usdc_vault.ts [vault_amount=50000] [filler_amount=1000000]
 */
import * as anchor from '@coral-xyz/anchor';
import { AnchorProvider, Program, BN } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount, getAssociatedTokenAddress, mintTo,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { PacificaOptions } from '../target/types/pacifica_options';
const IDL = require('../target/idl/pacifica_options.json');

const PROGRAM_ID = new PublicKey('CBkvR8SeN6j8RQKB7dSxG3dza2v71XHmWEe8LgfMW1hG');
const VAULT_AUTH = new PublicKey('AHWUeGsXbx9gd46SBS5SQK4rfQ8rGb1wWAzvZtJ6zdRg');
const USDC       = new PublicKey('HC53kut48rC2raro2XkuzmQD1g4MA3XgDK1HtfCfXf6k');

const VAULT_AMOUNT  = parseFloat(process.argv[2] || '50000');
const FILLER_AMOUNT = parseFloat(process.argv[3] || '1000000');

function loadFiller(): Keypair {
  const env = fs.readFileSync(path.resolve(__dirname, '../frontend/.env.local'), 'utf8');
  const m = env.match(/FILLER_KEYPAIR=(\[[^\]]+\])/);
  if (!m) throw new Error('FILLER_KEYPAIR not found');
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(m[1])));
}

async function main() {
  const mintAuth = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(path.resolve(os.homedir(), '.config/solana/id.json'), 'utf8'))),
  );
  const vaultAuth = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(path.resolve(os.homedir(), '.config/solana/usdp_authority.json'), 'utf8'))),
  );
  const filler = loadFiller();

  const conn = new Connection('https://api.devnet.solana.com', 'confirmed');

  // 1. Mint USDC to filler
  const fillerAta = await getOrCreateAssociatedTokenAccount(conn, mintAuth, USDC, filler.publicKey);
  console.log(`minting ${FILLER_AMOUNT} USDC to filler...`);
  await mintTo(conn, mintAuth, USDC, fillerAta.address, mintAuth, BigInt(Math.round(FILLER_AMOUNT * 1e6)));
  console.log('  filler USDC:', (await conn.getTokenAccountBalance(fillerAta.address)).value.uiAmount);

  // 2. Mint USDC to vault authority (for seeding vault)
  const authAta = await getOrCreateAssociatedTokenAccount(conn, mintAuth, USDC, vaultAuth.publicKey);
  console.log(`minting ${VAULT_AMOUNT} USDC to vault authority...`);
  await mintTo(conn, mintAuth, USDC, authAta.address, mintAuth, BigInt(Math.round(VAULT_AMOUNT * 1e6)));

  // 3. Deposit into vault via deposit_vault as vault authority
  const provider = new AnchorProvider(conn, new anchor.Wallet(vaultAuth), { commitment: 'confirmed' });
  anchor.setProvider(provider);
  const program = new Program<PacificaOptions>(IDL, provider);

  const [vault]     = PublicKey.findProgramAddressSync([Buffer.from('vault'), VAULT_AUTH.toBuffer()], PROGRAM_ID);
  const [vaultUsdc] = PublicKey.findProgramAddressSync([Buffer.from('vault_usdc'), vault.toBuffer()], PROGRAM_ID);
  const [vlpMint]   = PublicKey.findProgramAddressSync([Buffer.from('vlp_mint'), vault.toBuffer()], PROGRAM_ID);
  const [lpPos]     = PublicKey.findProgramAddressSync(
    [Buffer.from('vault_lp_position'), vaultAuth.publicKey.toBuffer(), vault.toBuffer()], PROGRAM_ID,
  );
  const authVlp = await getAssociatedTokenAddress(vlpMint, vaultAuth.publicKey);

  console.log(`depositing ${VAULT_AMOUNT} USDC into vault...`);
  const sig = await program.methods
    .depositVault({ usdcAmount: new BN(Math.round(VAULT_AMOUNT * 1e6)), minVlpTokens: new BN(0) } as any)
    .accounts({
      vault, usdcVault: vaultUsdc, vlpMint,
      depositorVlp: authVlp, depositorUsdc: authAta.address,
      lpPosition: lpPos, depositor: vaultAuth.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    } as any).rpc();
  console.log('  tx:', sig);

  console.log('  vault_usdc balance:', (await conn.getTokenAccountBalance(vaultUsdc)).value.uiAmount, 'USDC');
}
main().catch(e => { console.error(e.message ?? e); process.exit(1); });
