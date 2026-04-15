import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
(async () => {
  const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
  const USER = new PublicKey('9cNdqo8hi5eAmTZVw3AbLb3z8wGngM5hztjEWdTaYXLX');
  const USDP = new PublicKey('USDPqRbLidFGufty2s3oizmDEKdqx7ePTqzDMbf5ZKM');
  const HC53 = new PublicKey('HC53kut48rC2raro2XkuzmQD1g4MA3XgDK1HtfCfXf6k');
  for (const [n,m] of [['USDP',USDP],['HC53',HC53]] as const) {
    const a = await getAssociatedTokenAddress(m as PublicKey, USER);
    try { console.log(n,':', (await conn.getTokenAccountBalance(a)).value.uiAmount); }
    catch { console.log(n,': no ATA'); }
  }
})();
