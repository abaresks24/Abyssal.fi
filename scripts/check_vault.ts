import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import IDL from '../frontend/src/lib/pacifica_options_idl.json';

const PROGRAM_ID = new PublicKey('CBkvR8SeN6j8RQKB7dSxG3dza2v71XHmWEe8LgfMW1hG');
const VAULT_AUTH = new PublicKey('AHWUeGsXbx9gd46SBS5SQK4rfQ8rGb1wWAzvZtJ6zdRg');

async function main() {
  const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
  const dummy = { publicKey: PublicKey.default, signTransaction: async (t: any) => t, signAllTransactions: async (t: any[]) => t };
  const provider = new AnchorProvider(conn, dummy as any, { commitment: 'confirmed' });
  const program = new Program(IDL as any, provider);
  const [vault] = PublicKey.findProgramAddressSync([Buffer.from('vault'), VAULT_AUTH.toBuffer()], PROGRAM_ID);
  const v: any = await (program.account as any).optionVault.fetch(vault);
  console.log('total_collateral:', (v.totalCollateral as BN).toString(), '=', (v.totalCollateral as BN).toNumber()/1e6, 'USDC');
  console.log('open_interest:   ', (v.openInterest as BN).toString(), '=', (v.openInterest as BN).toNumber()/1e6, 'USDC');
  console.log('delta_net:       ', (v.deltaNet as BN).toString(), '=', (v.deltaNet as BN).toNumber()/1e6);
  const need = (v.openInterest as BN).toNumber() * 1.2 / 1e6;
  const have = (v.totalCollateral as BN).toNumber() / 1e6;
  console.log('\ncurrent required (OI × 1.2):', need, 'USDC');
  console.log('have:', have, 'USDC');
  console.log('buffer left:', (have - need).toFixed(2), 'USDC');
}
main().catch(console.error);
