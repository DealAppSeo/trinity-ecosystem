const fs = require('fs');
const bs58 = require('bs58');
const { Keypair } = require('@solana/web3.js');
const { execSync } = require('child_process');

try {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  const privKeyMatch = envContent.match(/AGENT_SOPHIA_PRIVKEY=(.*)/);
  if (!privKeyMatch) throw new Error("Private key not found");
  
  const privKey = privKeyMatch[1].trim();
  const decode = bs58.default ? bs58.default.decode : bs58.decode;
  const sophia = Keypair.fromSecretKey(decode(privKey));
  const pubkey = sophia.publicKey.toBase58();
  
  console.log(`FULL_PUBKEY=${pubkey}`);
  
  // Write pubkey back for future reference
  fs.appendFileSync('.env.local', `\nAGENT_SOPHIA_PUBKEY=${pubkey}\n`);
  
  console.log('Running solana airdrop...');
  try {
    const output = execSync(`solana airdrop 2 ${pubkey} --url devnet`, { encoding: 'utf8' });
    console.log(output);
  } catch (err) {
    console.error('Airdrop failed:', err.stdout || err.message);
  }
} catch (e) {
  console.error("Error:", e.message);
}
