// scripts/setup-solana.ts
// Generates keys, requests airdrops, and sets up `.env.local`

import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import * as fs from 'fs';
import * as bs58 from 'bs58';

async function main() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  console.log('🔗 Connected to Solana Devnet');

  // 1. Generate keys
  const sophia = Keypair.generate();
  const alphaCounterparty = Keypair.generate();
  const betaCounterparty = Keypair.generate();

  console.log('✓ Keys generated');
  console.log(`  SOPHIA: ${sophia.publicKey.toBase58()}`);
  console.log(`  ALPHA:  ${alphaCounterparty.publicKey.toBase58()}`);
  console.log(`  BETA:   ${betaCounterparty.publicKey.toBase58()}`);

  // 2. Airdrop SOL
  console.log('🔄 Requesting SOL Airdrop for SOPHIA...');
  try {
    const airdropSignature = await connection.requestAirdrop(sophia.publicKey, 2 * LAMPORTS_PER_SOL);
    // @ts-ignore
    const { blockhash } = await connection.getRecentBlockhash();
    // @ts-ignore
    await connection.confirmTransaction(airdropSignature);
    console.log('✓ 2 SOL Airdropped to SOPHIA');

    const bal = await connection.getBalance(sophia.publicKey);
    console.log(`  Balance: ${bal / LAMPORTS_PER_SOL} SOL`);
  } catch (e: any) {
    console.warn(`⚠️ Warning: Airdrop failed (rate limited?). Proceeding anyway: ${e.message}`);
  }

  // 3. Create Mock USDC Mint (since real Devnet USDC faucet might be flaky)
  console.log('🔄 Creating Mock USDC Mint...');
  let mint: PublicKey | null = null;
  try {
    mint = await createMint(connection, sophia, sophia.publicKey, null, 6);
    console.log(`✓ Mock USDC Mint created: ${mint.toBase58()}`);

    // 4. Mint 1M USDC to SOPHIA
    console.log('🔄 Minting 1,000,000 Mock USDC to SOPHIA...');
    const sophiaATA = await getOrCreateAssociatedTokenAccount(connection, sophia, mint, sophia.publicKey);
    await mintTo(connection, sophia, mint, sophiaATA.address, sophia, 1_000_000 * 1_000_000); // 1M with 6 decimals
    console.log('✓ 1,000,000 USDC Minted!');
  } catch (e: any) {
    console.warn(`⚠️ Warning: Mock USDC setup failed (needs SOL): ${e.message}`);
  }

  // 5. Append to .env.local
  const envVars = `\n
# TrustRails Dynamic Generated Keys (Solana Devnet)
AGENT_SOPHIA_PRIVKEY=${bs58.encode(sophia.secretKey)}
COUNTERPARTY_ALPHA_PUBKEY=${alphaCounterparty.publicKey.toBase58()}
COUNTERPARTY_BETA_PUBKEY=${betaCounterparty.publicKey.toBase58()}
USDC_DEVNET_MINT=${mint ? mint.toBase58() : 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr'}
`;

  fs.appendFileSync('.env.local', envVars);
  fs.appendFileSync('.env', envVars);
  console.log('✓ Keys written to .env and .env.local');

  console.log('\n=== SOLANA SETUP COMPLETE ===');
  console.log('You can now run the /demo endpoints!');
}

main().catch(console.error);
