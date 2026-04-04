/**
 * create_filler.ts — Generate a devnet SOL filler keypair.
 *
 * Run once:
 *   npx ts-node scripts/create_filler.ts
 *
 * Then fund the printed address with devnet SOL:
 *   solana airdrop 2 <FILLER_ADDRESS> --url devnet
 *
 * Copy the printed FILLER_KEYPAIR value into frontend/.env.local
 * (and into your Vercel project env vars for production).
 */

import { Keypair } from '@solana/web3.js';

const kp = Keypair.generate();

console.log('\n=== Filler keypair generated ===\n');
console.log('Public key (fund this address with devnet SOL):');
console.log(' ', kp.publicKey.toBase58());
console.log('\nAdd this to frontend/.env.local:');
console.log(`FILLER_KEYPAIR=[${Array.from(kp.secretKey).join(',')}]`);
console.log('\nFund it:');
console.log(`  solana airdrop 2 ${kp.publicKey.toBase58()} --url devnet`);
console.log('');
