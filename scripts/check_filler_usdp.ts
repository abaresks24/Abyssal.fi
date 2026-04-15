import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
const FILLER_SK = [199,34,121,52,99,214,148,31,89,44,7,26,85,196,163,122,199,230,167,136,254,178,0,176,181,254,137,222,92,94,232,79,227,69,249,195,37,210,170,177,88,112,165,15,250,11,174,121,135,83,67,165,202,12,114,186,254,136,192,28,200,70,210,144];
const filler = Keypair.fromSecretKey(Uint8Array.from(FILLER_SK));
const USDP = new PublicKey('USDPqRbLidFGufty2s3oizmDEKdqx7ePTqzDMbf5ZKM');
const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
(async () => {
  console.log('filler pubkey:', filler.publicKey.toBase58());
  console.log('SOL balance:', (await conn.getBalance(filler.publicKey)) / 1e9);
  const ata = await getAssociatedTokenAddress(USDP, filler.publicKey);
  console.log('USDP ATA:', ata.toBase58());
  try {
    const b = await conn.getTokenAccountBalance(ata);
    console.log('USDP balance:', b.value.uiAmount);
  } catch (e: any) {
    console.log('USDP ATA does not exist yet');
  }
})();
