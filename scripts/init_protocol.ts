/**
 * PacificaOptions — Protocol Initialization Script
 *
 * Run once after deployment to:
 *   1. Initialize the OptionVault
 *   2. Initialize IV oracles for BTC, ETH, SOL
 *
 * Usage:
 *   npx ts-node scripts/init_protocol.ts
 */
import * as anchor from '@coral-xyz/anchor';
import { AnchorProvider, BN, Program, web3 } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { PacificaOptions } from '../target/types/pacifica_options';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const IDL = require('../target/idl/pacifica_options.json');

// ── Config ───────────────────────────────────────────────────────────────────

const PROGRAM_ID  = new PublicKey('CBkvR8SeN6j8RQKB7dSxG3dza2v71XHmWEe8LgfMW1hG');
const USDC_MINT   = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
const RPC_URL     = 'https://api.devnet.solana.com';
const MARKETS     = [
  // Crypto
  { name: 'BTC',      disc: 0  },
  { name: 'ETH',      disc: 1  },
  { name: 'SOL',      disc: 2  },
  // Equities
  { name: 'NVDA',     disc: 3  },
  { name: 'TSLA',     disc: 4  },
  { name: 'PLTR',     disc: 5  },
  { name: 'CRCL',     disc: 6  },
  { name: 'HOOD',     disc: 7  },
  { name: 'SP500',    disc: 8  },
  // Commodities
  { name: 'XAU',      disc: 9  },
  { name: 'XAG',      disc: 10 },
  { name: 'PAXG',     disc: 11 },
  { name: 'PLATINUM', disc: 12 },
  { name: 'NATGAS',   disc: 13 },
  { name: 'COPPER',   disc: 14 },
];

// ── PDA helpers ──────────────────────────────────────────────────────────────

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

function ivOraclePDA(vault: PublicKey, disc: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('iv_oracle'), vault.toBuffer(), Buffer.from([disc])],
    PROGRAM_ID,
  );
}

function vlpMintPDA(vault: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vlp_mint'), vault.toBuffer()],
    PROGRAM_ID,
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Load authority keypair
  const keypairPath = path.resolve(os.homedir(), '.config/solana/id.json');
  if (!fs.existsSync(keypairPath)) {
    throw new Error(`Keypair not found at ${keypairPath}. Run: solana-keygen new`);
  }
  const raw = JSON.parse(fs.readFileSync(keypairPath, 'utf8'));
  const authority = Keypair.fromSecretKey(Uint8Array.from(raw));

  const connection = new Connection(RPC_URL, 'confirmed');
  const wallet     = new anchor.Wallet(authority);
  const provider   = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });
  anchor.setProvider(provider);

  const program = new Program<PacificaOptions>(IDL, provider);

  const [vault]     = vaultPDA(authority.publicKey);
  const [vaultUsdc] = vaultUsdcPDA(vault);

  console.log('═══════════════════════════════════════════════');
  console.log('  PacificaOptions — Protocol Initialization');
  console.log('═══════════════════════════════════════════════');
  console.log(`  Authority : ${authority.publicKey.toBase58()}`);
  console.log(`  Program   : ${PROGRAM_ID.toBase58()}`);
  const [vlpMint] = vlpMintPDA(vault);
  console.log(`  Vault PDA : ${vault.toBase58()}`);
  console.log(`  USDC vault: ${vaultUsdc.toBase58()}`);
  console.log(`  vLP mint  : ${vlpMint.toBase58()}`);
  console.log('───────────────────────────────────────────────\n');

  // ── 1. Initialize Vault ────────────────────────────────────────────────────

  const vaultInfo = await connection.getAccountInfo(vault);
  if (vaultInfo) {
    console.log('[1/4] Vault already initialized ✓');
  } else {
    console.log('[1/4] Initializing vault...');
    const tx = await program.methods
      .initializeVault()
      .accounts({
        vault,
        usdcVault: vaultUsdc,
        usdcMint: USDC_MINT,
        authority: authority.publicKey,
        keeper: authority.publicKey, // keeper = authority initially; update after deploy
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      } as any)
      .rpc();
    console.log(`  ✓ Vault initialized  tx: ${tx}\n`);
  }

  // ── 2. Initialize vLP SPL Mint ────────────────────────────────────────────

  const vaultState = await (program.account as any).optionVault.fetch(vault);
  const vlpMintAlreadySet =
    vaultState.vlpMint.toBase58() !== '11111111111111111111111111111111';

  if (vlpMintAlreadySet) {
    console.log(`[2/${MARKETS.length + 2}] vLP mint already initialized ✓  ${vlpMint.toBase58()}`);
  } else {
    console.log(`[2/${MARKETS.length + 2}] Initializing vLP SPL mint...`);
    const tx = await program.methods
      .initializeVlpMint()
      .accounts({
        vault,
        vlpMint,
        authority: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      } as any)
      .rpc();
    console.log(`  ✓ vLP mint: ${vlpMint.toBase58()}`);
    console.log(`     tx: ${tx}\n`);
  }

  // ── 3-N. Initialize IV Oracles ────────────────────────────────────────────

  for (let i = 0; i < MARKETS.length; i++) {
    const { name, disc } = MARKETS[i];
    const [oracle] = ivOraclePDA(vault, disc);

    const oracleInfo = await connection.getAccountInfo(oracle);
    if (oracleInfo) {
      console.log(`[${i + 3}/${MARKETS.length + 2}] ${name} oracle already initialized ✓  ${oracle.toBase58()}`);
    } else {
      console.log(`[${i + 3}/${MARKETS.length + 2}] Initializing ${name} IV oracle...`);
      const tx = await program.methods
        .initializeIvOracle(disc)
        .accounts({
          vault,
          ivOracle: oracle,
          authority: authority.publicKey,
          systemProgram: web3.SystemProgram.programId,
        } as any)
        .rpc();
      console.log(`  ✓ ${name} oracle: ${oracle.toBase58()}`);
      console.log(`     tx: ${tx}\n`);
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  console.log('\n═══════════════════════════════════════════════');
  console.log('  Initialization complete!');
  console.log('═══════════════════════════════════════════════');
  console.log(`  Program:     ${PROGRAM_ID.toBase58()}`);
  console.log(`  Vault:       ${vault.toBase58()}`);
  console.log(`  Vault USDC:  ${vaultUsdc.toBase58()}`);
  console.log(`  vLP Mint:    ${vlpMint.toBase58()}`);
  for (const { name, disc } of MARKETS) {
    const [oracle] = ivOraclePDA(vault, disc);
    console.log(`  ${name} Oracle:   ${oracle.toBase58()}`);
  }
  console.log('\n  Next steps:');
  console.log('  1. Add AUTHORITY_KEYPAIR=[...] to frontend/.env.local');
  console.log('  2. Start the IV engine:  cd iv_engine && python main.py');
  console.log('  3. Start the frontend:   cd frontend && npm run dev');
  console.log('  4. Use "Get devnet USDC" in wallet menu to fund wallets');
  console.log('  5. Deposit into vault via LP Vault tab — receive vLP SPL tokens');
  console.log('═══════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('\n[ERROR]', err.message ?? err);
  process.exit(1);
});
