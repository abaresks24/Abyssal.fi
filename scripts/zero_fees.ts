import * as anchor from '@coral-xyz/anchor';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { PacificaOptions } from '../target/types/pacifica_options';
const IDL = require('../target/idl/pacifica_options.json');

const PROGRAM_ID = new PublicKey('CBkvR8SeN6j8RQKB7dSxG3dza2v71XHmWEe8LgfMW1hG');

async function main() {
  const auth = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(path.resolve(os.homedir(), '.config/solana/usdp_authority.json'), 'utf8'))),
  );
  const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
  const provider = new AnchorProvider(conn, new anchor.Wallet(auth), { commitment: 'confirmed' });
  anchor.setProvider(provider);
  const program = new Program<PacificaOptions>(IDL, provider);

  const [vault] = PublicKey.findProgramAddressSync([Buffer.from('vault'), auth.publicKey.toBuffer()], PROGRAM_ID);
  const before: any = await (program.account as any).optionVault.fetch(vault);
  console.log('BEFORE fees_collected:', before.feesCollected.toString());

  const sig = await program.methods.zeroFeesCollected().accounts({ vault, authority: auth.publicKey } as any).rpc();
  console.log('tx:', sig);

  const after: any = await (program.account as any).optionVault.fetch(vault);
  console.log('AFTER  fees_collected:', after.feesCollected.toString());
}
main().catch(e => { console.error(e.message ?? e); process.exit(1); });
