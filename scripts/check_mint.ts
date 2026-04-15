import { Connection, PublicKey } from '@solana/web3.js';
const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
const VAULT_USDC = new PublicKey('4V3a9TiePG2mAMC8tdkcCrLaTe3HCaaYfUWqKr7XQbev');
(async () => {
  const info = await conn.getParsedAccountInfo(VAULT_USDC);
  const parsed: any = (info.value?.data as any)?.parsed;
  console.log('vault_usdc mint:', parsed?.info?.mint);
  console.log('owner:', parsed?.info?.owner);
})();
