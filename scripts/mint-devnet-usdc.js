const { Connection, Keypair } = require('@solana/web3.js');
const { createMint, getOrCreateAssociatedTokenAccount, mintTo } = require('@solana/spl-token');
const bs58 = require('bs58');
const fs = require('fs');

async function setup() {
  let envContent = fs.readFileSync('.env.local', 'utf8');
  
  const privKeyMatch = envContent.match(/AGENT_SOPHIA_PRIVKEY=(.*)/);
  if (!privKeyMatch) throw new Error("Missing AGENT_SOPHIA_PRIVKEY");
  
  const privKey = privKeyMatch[1].trim();
  const decode = bs58.default ? bs58.default.decode : bs58.decode;
  const secretKey = decode(privKey);
  const payer = Keypair.fromSecretKey(secretKey);

  // Write the byte array to env so Next.js can read it without bs58
  if (!envContent.includes('AGENT_SOPHIA_SECRET_BYTES')) {
    const bytesArray = '[' + secretKey.join(',') + ']';
    envContent += `\nAGENT_SOPHIA_SECRET_BYTES=${bytesArray}\n`;
  }

  const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
  console.log("Connected to Devnet. Payer:", payer.publicKey.toBase58());

  const balance = await conn.getBalance(payer.publicKey);
  console.log(`Payer SOL Balance: ${balance / 1e9} SOL`);
  if (balance === 0) throw new Error("Wallet has 0 SOL. Cannot mint tokens. Please run solana airdrop first.");

  console.log("Creating new Mint...");
  const mint = await createMint(conn, payer, payer.publicKey, null, 6);
  const mintStr = mint.toBase58();
  console.log('NEW_USDC_DEVNET_MINT=' + mintStr);
  
  const ata = await getOrCreateAssociatedTokenAccount(
    conn, payer, mint, payer.publicKey
  );
  
  console.log("Minting tokens to ATA...");
  await mintTo(conn, payer, mint, ata.address, payer, 100_000_000_000);
  console.log('Minted 100,000 USDC to SOPHIA');
  console.log('ATA:', ata.address.toBase58());
  
  if (envContent.includes('USDC_DEVNET_MINT=')) {
    envContent = envContent.replace(/USDC_DEVNET_MINT=.*/g, `USDC_DEVNET_MINT=${mintStr}`);
  } else {
    envContent += `\nUSDC_DEVNET_MINT=${mintStr}\n`;
  }
  fs.writeFileSync('.env.local', envContent);

  const execPath = 'lib/trustshell/SolanaExecutor.ts';
  let execContent = fs.readFileSync(execPath, 'utf8');
  execContent = execContent.replace(/process\.env\.USDC_DEVNET_MINT \|\| '.*?'/, `process.env.USDC_DEVNET_MINT || '${mintStr}'`);
  fs.writeFileSync(execPath, execContent);

  console.log("✅ SUCCESS! Updated .env.local and the hardcoded fallback in SolanaExecutor.ts!");
  console.log("👉 Now run the demo: curl -X POST http://localhost:3000/api/trustrails/demo");
}

setup().catch(console.error);
