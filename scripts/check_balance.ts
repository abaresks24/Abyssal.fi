import { Connection, PublicKey } from '@solana/web3.js';
const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
const VAULT_USDC = new PublicKey('4V3a9TiePG2mAMC8tdkcCrLaTe3HCaaYfUWqKr7XQbev');
(async () => {
  const b = await conn.getTokenAccountBalance(VAULT_USDC);
  console.log('vault_usdc balance:', b.value.uiAmount, 'USDC');
  console.log('raw:', b.value.amount);
})();
