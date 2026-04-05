/**
 * set_ablp_metadata.ts — Attach on-chain Metaplex metadata to the ABLP mint.
 *
 * Flow:
 *   1. Call take_vlp_mint_authority  → vault PDA transfers mint authority to admin keypair
 *   2. Create Metaplex metadata account using admin keypair as mint authority
 *   3. Call restore_vlp_mint_authority → admin keypair returns mint authority to vault PDA
 *
 * Run once after deploy:
 *   npx ts-node scripts/set_ablp_metadata.ts
 */
import * as anchor from '@coral-xyz/anchor';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { PacificaOptions } from '../target/types/pacifica_options';

import {
  createUmi,
} from '@metaplex-foundation/umi-bundle-defaults';
import {
  createSignerFromKeypair,
  signerIdentity,
  publicKey as umiPublicKey,
  keypairIdentity,
} from '@metaplex-foundation/umi';
import { fromWeb3JsKeypair } from '@metaplex-foundation/umi-web3js-adapters';
import {
  createMetadataAccountV3,
  MPL_TOKEN_METADATA_PROGRAM_ID,
  findMetadataPda,
} from '@metaplex-foundation/mpl-token-metadata';

const IDL = require('../target/idl/pacifica_options.json');

const PROGRAM_ID = new PublicKey('CBkvR8SeN6j8RQKB7dSxG3dza2v71XHmWEe8LgfMW1hG');
const VLP_MINT   = new PublicKey('4swq2n3c9SeJHRLvz6NcuYkUVwxGVPgF5m2ELzAHPzzU');
const RPC_URL    = 'https://api.devnet.solana.com';

const METADATA_URI =
  'https://raw.githubusercontent.com/abaresks24/Abyssal.fi/main/assets/ablp-metadata.json';

async function main() {
  // ── Keypairs ──────────────────────────────────────────────────────────────
  const authorityPath = path.resolve(os.homedir(), '.config/solana/vault_authority.json');
  const authority = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(authorityPath, 'utf8'))),
  );

  const connection = new Connection(RPC_URL, 'confirmed');
  const wallet     = new anchor.Wallet(authority);
  const provider   = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  anchor.setProvider(provider);

  const program = new Program<PacificaOptions>(IDL, provider);

  // ── PDAs ─────────────────────────────────────────────────────────────────
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), authority.publicKey.toBuffer()],
    PROGRAM_ID,
  );
  const [vlpMint] = PublicKey.findProgramAddressSync(
    [Buffer.from('vlp_mint'), vault.toBuffer()],
    PROGRAM_ID,
  );

  console.log('vault        :', vault.toBase58());
  console.log('vlp_mint PDA :', vlpMint.toBase58());
  console.log('VLP_MINT     :', VLP_MINT.toBase58());

  // Check current mint authority
  const mintInfo = await connection.getParsedAccountInfo(VLP_MINT);
  const parsedMint = (mintInfo.value?.data as any)?.parsed?.info;
  const currentAuthority: string = parsedMint?.mintAuthority ?? '';
  console.log('current mint authority:', currentAuthority);

  // ── Step 1: take_vlp_mint_authority (only if vault PDA still holds it) ───
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), authority.publicKey.toBuffer()],
    PROGRAM_ID,
  );
  if (currentAuthority === vaultPda.toBase58()) {
    console.log('\n[1/3] Taking mint authority → admin keypair…');
    const sig1 = await (program.methods as any)
      .takeVlpMintAuthority()
      .accounts({
        vault,
        vlpMint,
        newAuthority: authority.publicKey,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log('✓ takeVlpMintAuthority tx:', sig1);
  } else if (currentAuthority === authority.publicKey.toBase58()) {
    console.log('\n[1/3] Mint authority already held by admin keypair — skipping take.');
  } else {
    throw new Error(`Unexpected mint authority: ${currentAuthority}`);
  }

  // ── Step 2: Create Metaplex metadata ─────────────────────────────────────
  console.log('\n[2/3] Creating Metaplex metadata account…');
  const umi = createUmi(RPC_URL);

  // Convert web3.js Keypair → UMI keypair using the official adapter
  const umiKeypair = fromWeb3JsKeypair(authority);
  const signer     = createSignerFromKeypair(umi, umiKeypair);
  umi.use(keypairIdentity(umiKeypair));

  console.log('UMI signer pubkey:', umiKeypair.publicKey);

  const mintAddress = umiPublicKey(VLP_MINT.toBase58());
  const [metadataPda] = findMetadataPda(umi, { mint: mintAddress });

  const createTx = await createMetadataAccountV3(umi, {
    metadata:              metadataPda,
    mint:                  mintAddress,
    mintAuthority:         signer,
    payer:                 signer,
    updateAuthority:       signer,
    data: {
      name:                'Abyssal LP',
      symbol:              'ABLP',
      uri:                 METADATA_URI,
      sellerFeeBasisPoints: 0,
      creators:            null,
      collection:          null,
      uses:                null,
    },
    isMutable:  true,
    collectionDetails: null,
  }).sendAndConfirm(umi);

  console.log('✓ Metadata created. tx:', Buffer.from(createTx.signature).toString('hex').slice(0, 20) + '…');

  // ── Step 3: restore_vlp_mint_authority ────────────────────────────────────
  console.log('\n[3/3] Restoring mint authority → vault PDA…');
  const sig3 = await (program.methods as any)
    .restoreVlpMintAuthority()
    .accounts({
      vault,
      vlpMint,
      currentAuthority: authority.publicKey,
      tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
    })
    .rpc();
  console.log('✓ restoreVlpMintAuthority tx:', sig3);

  // ── Verify ────────────────────────────────────────────────────────────────
  const after = await connection.getParsedAccountInfo(VLP_MINT);
  const afterMint = (after.value?.data as any)?.parsed?.info;
  console.log('\nFinal mint authority:', afterMint?.mintAuthority ?? 'unknown');
  console.log('\nDone! ABLP token metadata is live on devnet.');
  console.log('Metadata PDA:', metadataPda);
}

main().catch(e => { console.error(e.message ?? e); process.exit(1); });
