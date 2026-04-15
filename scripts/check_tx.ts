import { Connection } from '@solana/web3.js';
(async () => {
  const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
  const sigs = ['48p6R2j8H6S34w1C', '468tEAuEayE4XfBY', '5HbVPNQ7fwYo9jtN', '2YMTnqMfDCsSQXQd'];
  for (const partial of sigs) {
    const full = (await conn.getSignaturesForAddress(new (await import('@solana/web3.js')).PublicKey('9cNdqo8hi5eAmTZVw3AbLb3z8wGngM5hztjEWdTaYXLX'), {limit:15})).find(s => s.signature.startsWith(partial));
    if (!full) continue;
    const tx = await conn.getParsedTransaction(full.signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
    console.log(`\n=== ${full.signature.slice(0,20)}... ${full.err ? 'ERROR' : 'OK'} ===`);
    if (tx?.meta?.logMessages) {
      for (const log of tx.meta.logMessages.slice(-15)) console.log('  ', log);
    }
  }
})();
