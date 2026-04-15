import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
const FILLER = new PublicKey('58ZYLbE63N79tBrfSEUAyWY28muzAnV7MDjKt754tm4t');
const USDP = new PublicKey('USDPqRbLidFGufty2s3oizmDEKdqx7ePTqzDMbf5ZKM');
const HC53 = new PublicKey('HC53kut48rC2raro2XkuzmQD1g4MA3XgDK1HtfCfXf6k');
(async () => {
  console.log('SOL:', (await conn.getBalance(FILLER))/1e9);
  for (const [n,m] of [['USDP',USDP],['HC53 USDC',HC53]] as const) {
    const a = await getAssociatedTokenAddress(m as PublicKey, FILLER);
    try { console.log(n,':', (await conn.getTokenAccountBalance(a)).value.uiAmount); }
    catch { console.log(n, ': no ATA'); }
  }
})();
