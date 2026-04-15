import { Connection, PublicKey } from '@solana/web3.js';
(async () => {
  const conn = new Connection('https://api.devnet.solana.com');
  const acc = new PublicKey('4V3a9TiePG2mAMC8tdkcCrLaTe3HCaaYfUWqKr7XQbev');
  for (const commit of ['processed', 'confirmed', 'finalized'] as const) {
    const b = await conn.getTokenAccountBalance(acc, commit);
    console.log(commit, '→ amount:', b.value.amount, 'ui:', b.value.uiAmount);
  }
})();
