import { Connection, PublicKey } from '@solana/web3.js';
const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
const HC53 = new PublicKey('HC53kut48rC2raro2XkuzmQD1g4MA3XgDK1HtfCfXf6k');
(async () => {
  const info = await conn.getParsedAccountInfo(HC53);
  const p: any = (info.value?.data as any)?.parsed;
  console.log('HC53 mint auth:', p?.info?.mintAuthority);
  console.log('supply:', Number(p?.info?.supply)/1e6);
})();
