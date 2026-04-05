/**
 * init_usdp_vault.ts — Initialize a fresh vault using Pacifica's USDP token.
 *
 * Uses id.json as authority (different PDA from the old USDC vault).
 * Initializes: vault + vLP mint + IV oracles for all markets.
 *
 *   npx ts-node scripts/init_usdp_vault.ts
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
const USDP_MINT  = new PublicKey('USDPqRbLidFGufty2s3oizmDEKdqx7ePTqzDMbf5ZKM');
const RPC_URL    = 'https://api.devnet.solana.com';

const MARKETS = [
  { name: 'BTC',      disc: 0  },
  { name: 'ETH',      disc: 1  },
  { name: 'SOL',      disc: 2  },
  { name: 'NVDA',     disc: 3  },
  { name: 'TSLA',     disc: 4  },
  { name: 'PLTR',     disc: 5  },
  { name: 'CRCL',     disc: 6  },
  { name: 'HOOD',     disc: 7  },
  { name: 'SP500',    disc: 8  },
  { name: 'XAU',      disc: 9  },
  { name: 'XAG',      disc: 10 },
  { name: 'PAXG',     disc: 11 },
  { name: 'PLATINUM', disc: 12 },
  { name: 'NATGAS',   disc: 13 },
  { name: 'COPPER',   disc: 14 },
];

function vaultPDA(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('vault'), authority.toBuffer()], PROGRAM_ID);
}
function vaultUsdcPDA(vault: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('vault_usdc'), vault.toBuffer()], PROGRAM_ID);
}
function ivOraclePDA(vault: PublicKey, disc: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('iv_oracle'), vault.toBuffer(), Buffer.from([disc])], PROGRAM_ID);
}
function vlpMintPDA(vault: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('vlp_mint'), vault.toBuffer()], PROGRAM_ID);
}

async function main() {
  // Use usdp_authority.json — dedicated keypair for the USDP vault (fresh PDA)
  const authorityPath = path.resolve(os.homedir(), '.config/solana/usdp_authority.json');
  const authority = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(authorityPath, 'utf8'))),
  );

  // Keeper = vault_authority.json
  const keeperPath = path.resolve(os.homedir(), '.config/solana/vault_authority.json');
  const keeper = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(keeperPath, 'utf8'))),
  );

  const connection = new Connection(RPC_URL, 'confirmed');
  const wallet     = new anchor.Wallet(authority);
  const provider   = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  anchor.setProvider(provider);

  const program = new Program<PacificaOptions>(IDL, provider);

  const [vault]    = vaultPDA(authority.publicKey);
  const [vaultUsdc] = vaultUsdcPDA(vault);
  const [vlpMint]  = vlpMintPDA(vault);

  console.log('═══════════════════════════════════════════════');
  console.log('  Abyssal.fi — USDP Vault Initialization');
  console.log('═══════════════════════════════════════════════');
  console.log(`  Authority : ${authority.publicKey.toBase58()}`);
  console.log(`  Keeper    : ${keeper.publicKey.toBase58()}`);
  console.log(`  USDP Mint : ${USDP_MINT.toBase58()}`);
  console.log(`  Vault PDA : ${vault.toBase58()}`);
  console.log(`  Vault USDC: ${vaultUsdc.toBase58()}`);
  console.log(`  vLP Mint  : ${vlpMint.toBase58()}`);
  console.log('───────────────────────────────────────────────\n');

  // ── 1. Initialize Vault ───────────────────────────────────────────────────
  const vaultInfo = await connection.getAccountInfo(vault);
  if (vaultInfo) {
    console.log('[1] Vault already initialized ✓');
  } else {
    console.log('[1] Initializing vault...');
    const tx = await program.methods
      .initializeVault()
      .accounts({
        vault,
        usdcVault:    vaultUsdc,
        usdcMint:     USDP_MINT,
        authority:    authority.publicKey,
        keeper:       keeper.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent:          web3.SYSVAR_RENT_PUBKEY,
      } as any)
      .rpc();
    console.log(`  ✓ tx: ${tx}\n`);
  }

  // ── 2. Initialize vLP SPL Mint ────────────────────────────────────────────
  const vaultState = await (program.account as any).optionVault.fetch(vault);
  const vlpSet = vaultState.vlpMint.toBase58() !== '11111111111111111111111111111111';

  if (vlpSet) {
    console.log(`[2] vLP mint already initialized ✓  ${vlpMint.toBase58()}`);
  } else {
    console.log('[2] Initializing vLP mint...');
    const tx = await program.methods
      .initializeVlpMint()
      .accounts({
        vault,
        vlpMint,
        authority:     authority.publicKey,
        tokenProgram:  TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent:          web3.SYSVAR_RENT_PUBKEY,
      } as any)
      .rpc();
    console.log(`  ✓ vLP mint: ${vlpMint.toBase58()}  tx: ${tx}\n`);
  }

  // ── 3. Initialize IV Oracles ──────────────────────────────────────────────
  for (let i = 0; i < MARKETS.length; i++) {
    const { name, disc } = MARKETS[i];
    const [oracle] = ivOraclePDA(vault, disc);
    const oracleInfo = await connection.getAccountInfo(oracle);
    if (oracleInfo) {
      console.log(`[${i + 3}] ${name} oracle already initialized ✓`);
    } else {
      console.log(`[${i + 3}] Initializing ${name} oracle...`);
      const tx = await program.methods
        .initializeIvOracle(disc)
        .accounts({
          vault,
          ivOracle: oracle,
          authority: authority.publicKey,
          systemProgram: web3.SystemProgram.programId,
        } as any)
        .rpc();
      console.log(`  ✓ ${name}: ${oracle.toBase58()}  tx: ${tx}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log('  USDP Vault ready! Update .env.local with:');
  console.log('═══════════════════════════════════════════════');
  console.log(`VAULT_AUTHORITY=${authority.publicKey.toBase58()}`);
  console.log(`VAULT_PDA=${vault.toBase58()}`);
  console.log(`VAULT_USDC=${vaultUsdc.toBase58()}`);
  console.log(`VLP_MINT=${vlpMint.toBase58()}`);
  console.log(`NEXT_PUBLIC_USDC_MINT=${USDP_MINT.toBase58()}`);
  for (const { name, disc } of MARKETS) {
    const [oracle] = ivOraclePDA(vault, disc);
    console.log(`${name}_ORACLE=${oracle.toBase58()}`);
  }
  console.log('═══════════════════════════════════════════════\n');
}

main().catch(e => { console.error(e.message ?? e); process.exit(1); });
