/**
 * Add Metaplex metadata to the new vLP mint so Phantom shows "ABLP" with logo.
 *
 * Usage: npx ts-node scripts/add_vlp_metadata.ts
 *
 * Requires: VAULT_AUTHORITY keypair (the authority that can sign for the vault PDA).
 * The vault PDA is the mint authority of vlpMint, so only it can create metadata.
 */
import {
  Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  createCreateMetadataAccountV3Instruction,
} from '@metaplex-foundation/mpl-token-metadata';
import fs from 'fs';

const PROGRAM_ID = new PublicKey('CBkvR8SeN6j8RQKB7dSxG3dza2v71XHmWEe8LgfMW1hG');
const VAULT_AUTHORITY_PK = new PublicKey('AHWUeGsXbx9gd46SBS5SQK4rfQ8rGb1wWAzvZtJ6zdRg');
const RPC = 'https://api.devnet.solana.com';

const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

async function main() {
  const conn = new Connection(RPC, 'confirmed');

  // Load the vault authority keypair
  const authorityPath = process.env.VAULT_AUTHORITY_KEYPAIR
    || `${process.env.HOME}/.config/solana/usdp_authority.json`;
  console.log('Loading authority from:', authorityPath);
  const authorityKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(authorityPath, 'utf8'))),
  );
  console.log('Authority pubkey:', authorityKeypair.publicKey.toBase58());

  if (authorityKeypair.publicKey.toBase58() !== VAULT_AUTHORITY_PK.toBase58()) {
    console.error('ERROR: Loaded keypair does not match VAULT_AUTHORITY!');
    console.error('Expected:', VAULT_AUTHORITY_PK.toBase58());
    console.error('Got:', authorityKeypair.publicKey.toBase58());
    process.exit(1);
  }

  // Derive vault and vlpMint PDAs
  const [vault, vaultBump] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), VAULT_AUTHORITY_PK.toBuffer()],
    PROGRAM_ID,
  );
  const [vlpMint] = PublicKey.findProgramAddressSync(
    [Buffer.from('vlp_mint'), vault.toBuffer()],
    PROGRAM_ID,
  );
  console.log('Vault PDA:', vault.toBase58());
  console.log('vLP Mint:', vlpMint.toBase58());

  // Derive metadata PDA
  const [metadataPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), TOKEN_METADATA_PROGRAM_ID.toBuffer(), vlpMint.toBuffer()],
    TOKEN_METADATA_PROGRAM_ID,
  );
  console.log('Metadata PDA:', metadataPDA.toBase58());

  // Check if metadata already exists
  const metaInfo = await conn.getAccountInfo(metadataPDA);
  if (metaInfo) {
    console.log('Metadata already exists! Skipping.');
    return;
  }

  // Create metadata
  const ix = createCreateMetadataAccountV3Instruction(
    {
      metadata: metadataPDA,
      mint: vlpMint,
      mintAuthority: vault,         // vault PDA is the mint authority
      payer: authorityKeypair.publicKey,
      updateAuthority: vault,       // vault PDA is also the update authority
    },
    {
      createMetadataAccountArgsV3: {
        data: {
          name: 'Abyssal LP',
          symbol: 'ABLP',
          uri: 'https://raw.githubusercontent.com/abaresks24/Abyssal.fi/main/assets/ablp-metadata.json',
          sellerFeeBasisPoints: 0,
          creators: null,
          collection: null,
          uses: null,
        },
        isMutable: true,
        collectionDetails: null,
      },
    },
  );

  // The vault PDA needs to sign as mint authority.
  // But we can't sign with a PDA directly — we need a CPI from the program.
  // Instead, let's check if the program has an instruction for this.
  console.log('\nNOTE: The vault PDA is the mint authority of vlpMint.');
  console.log('To create metadata, the vault PDA must sign the instruction.');
  console.log('This requires a CPI from the Anchor program.');
  console.log('\nAlternative: temporarily take mint authority, create metadata, then restore.');

  // Use take_vlp_mint_authority if available
  console.log('\nThe program has take_vlp_mint_authority and restore_vlp_mint_authority.');
  console.log('Step 1: take authority -> Step 2: create metadata -> Step 3: restore authority');
}

main().catch(console.error);
