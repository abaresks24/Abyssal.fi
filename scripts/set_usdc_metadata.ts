/**
 * set_usdc_metadata.ts — Add Metaplex metadata to the devnet USDC mint
 * so Phantom shows "USD Coin / USDC" instead of "Unknown Token".
 *
 * The USDC mint authority is id.json (not a PDA), so we sign directly.
 *
 *   npx ts-node scripts/set_usdc_metadata.ts
 */
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { keypairIdentity, createSignerFromKeypair } from '@metaplex-foundation/umi';
import { fromWeb3JsKeypair } from '@metaplex-foundation/umi-web3js-adapters';
import {
  createMetadataAccountV3,
  findMetadataPda,
} from '@metaplex-foundation/mpl-token-metadata';
import { publicKey as umiPublicKey } from '@metaplex-foundation/umi';

const USDC_MINT = new PublicKey('HC53kut48rC2raro2XkuzmQD1g4MA3XgDK1HtfCfXf6k');
const RPC_URL   = 'https://api.devnet.solana.com';

// We host the JSON on GitHub; image points to the real USDC logo
const METADATA_URI = 'https://raw.githubusercontent.com/abaresks24/Abyssal.fi/main/assets/usdc-metadata.json';

async function main() {
  const kpPath = path.resolve(os.homedir(), '.config/solana/id.json');
  const mintAuthority = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(kpPath, 'utf8'))),
  );
  console.log('Mint authority:', mintAuthority.publicKey.toBase58());

  const connection = new Connection(RPC_URL, 'confirmed');
  const mintInfo = await connection.getParsedAccountInfo(USDC_MINT);
  const currentAuth = (mintInfo.value?.data as any)?.parsed?.info?.mintAuthority;
  console.log('Current mint authority:', currentAuth);

  if (currentAuth !== mintAuthority.publicKey.toBase58()) {
    throw new Error(`Key mismatch — expected ${mintAuthority.publicKey.toBase58()}, got ${currentAuth}`);
  }

  const umi = createUmi(RPC_URL);
  const umiKp = fromWeb3JsKeypair(mintAuthority);
  umi.use(keypairIdentity(umiKp));

  const mintAddr = umiPublicKey(USDC_MINT.toBase58());
  const [metadataPda] = findMetadataPda(umi, { mint: mintAddr });

  console.log('\nCreating USDC metadata…');
  const result = await createMetadataAccountV3(umi, {
    metadata:        metadataPda,
    mint:            mintAddr,
    mintAuthority:   createSignerFromKeypair(umi, umiKp),
    payer:           createSignerFromKeypair(umi, umiKp),
    updateAuthority: createSignerFromKeypair(umi, umiKp),
    data: {
      name:                'USD Coin',
      symbol:              'USDC',
      uri:                 METADATA_URI,
      sellerFeeBasisPoints: 0,
      creators:   null,
      collection: null,
      uses:       null,
    },
    isMutable:         true,
    collectionDetails: null,
  }).sendAndConfirm(umi);

  console.log('✓ USDC metadata created. tx:', Buffer.from(result.signature).toString('hex').slice(0, 20) + '…');
  console.log('Metadata PDA:', metadataPda);
}

main().catch(e => { console.error(e.message ?? e); process.exit(1); });
