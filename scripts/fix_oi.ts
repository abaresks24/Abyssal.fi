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
  const keypairPath = path.resolve(os.homedir(), '.config/solana/vault_authority.json');
  const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf8'))));
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  const provider = new AnchorProvider(connection, new anchor.Wallet(authority), { commitment: 'confirmed' });
  anchor.setProvider(provider);
  const program = new Program<PacificaOptions>(IDL, provider);
  const [vault] = PublicKey.findProgramAddressSync([Buffer.from('vault'), authority.publicKey.toBuffer()], PROGRAM_ID);

  const before: any = await (program.account as any).optionVault.fetch(vault);
  console.log('BEFORE open_interest:', before.openInterest.toString(), 'delta_net:', before.deltaNet.toString());

  const sig = await program.methods.fixOpenInterest().accounts({ vault, authority: authority.publicKey } as any).rpc();
  console.log('tx:', sig);

  const after: any = await (program.account as any).optionVault.fetch(vault);
  console.log('AFTER  open_interest:', after.openInterest.toString(), 'delta_net:', after.deltaNet.toString());
}
main().catch(e => { console.error(e.message ?? e); process.exit(1); });
