import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import * as fs from 'fs';
const USDP = new PublicKey('USDPqRbLidFGufty2s3oizmDEKdqx7ePTqzDMbf5ZKM');
const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
async function check(label: string, kpPath: string) {
  const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(kpPath, 'utf8'))));
  const ata = await getAssociatedTokenAddress(USDP, kp.publicKey);
  try {
    const b = await conn.getTokenAccountBalance(ata);
    console.log(label, kp.publicKey.toBase58(), '→', b.value.uiAmount, 'USDP');
  } catch {
    console.log(label, kp.publicKey.toBase58(), '→ no USDP account');
  }
}
(async () => {
  await check('id.json         ', process.env.HOME + '/.config/solana/id.json');
  await check('vault_authority ', process.env.HOME + '/.config/solana/vault_authority.json');
  await check('usdp_authority  ', process.env.HOME + '/.config/solana/usdp_authority.json');
  await check('keeper          ', process.env.HOME + '/.config/solana/keeper.json');
})();
