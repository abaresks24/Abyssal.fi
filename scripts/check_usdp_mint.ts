import { Connection, PublicKey } from '@solana/web3.js';
const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
const USDP = new PublicKey('USDPqRbLidFGufty2s3oizmDEKdqx7ePTqzDMbf5ZKM');
(async () => {
  const info = await conn.getParsedAccountInfo(USDP);
  const parsed: any = (info.value?.data as any)?.parsed;
  console.log('mintAuthority:', parsed?.info?.mintAuthority);
  console.log('decimals:', parsed?.info?.decimals);
  console.log('supply:', parsed?.info?.supply);
})();
