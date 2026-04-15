import { Keypair } from '@solana/web3.js';
const SK = [17,240,176,238,113,72,3,141,169,44,81,221,222,137,46,101,255,109,67,105,33,75,152,142,87,234,182,244,160,56,9,220,137,243,205,248,199,53,103,56,29,158,246,34,56,254,239,114,117,254,235,54,235,74,124,153,61,61,169,0,224,153,156,63];
const kp = Keypair.fromSecretKey(Uint8Array.from(SK));
console.log('USDP_AUTHORITY_KEYPAIR pubkey:', kp.publicKey.toBase58());
