import { Connection, PublicKey } from '@solana/web3.js';
const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
const USDP = new PublicKey('USDPqRbLidFGufty2s3oizmDEKdqx7ePTqzDMbf5ZKM');
(async () => {
  const accs = await conn.getProgramAccounts(new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), {
    filters: [{ dataSize: 165 }, { memcmp: { offset: 0, bytes: USDP.toBase58() } }],
  });
  const holders: { owner: string; amount: number }[] = [];
  for (const a of accs) {
    const data = a.account.data as Buffer;
    const owner = new PublicKey(data.slice(32, 64)).toBase58();
    const amount = Number(data.readBigUInt64LE(64)) / 1e6;
    if (amount > 0) holders.push({ owner, amount });
  }
  holders.sort((a, b) => b.amount - a.amount);
  console.log('Top USDP holders:');
  holders.slice(0, 10).forEach(h => console.log(' ', h.owner, '→', h.amount.toLocaleString()));
})();
