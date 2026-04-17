const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const fs = require('fs');

async function main() {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  const pubkeyMatch = envContent.match(/AGENT_SOPHIA_PUBKEY=(.*)/);
  const pubkey = pubkeyMatch ? pubkeyMatch[1].trim() : '43TSvktkyt3Fjb1C7eAkzW94GoFpD3Gi3ukGZT6TyKEz';

  const endpoints = [
    'https://devnet.genesysgo.net/',
    'https://api.devnet.solana.com',
    'https://rpc.ankr.com/solana_devnet'
  ];

  for (const url of endpoints) {
    try {
      console.log(`Trying ${url}...`);
      const conn = new Connection(url, 'confirmed');
      const sig = await conn.requestAirdrop(new PublicKey(pubkey), 2 * LAMPORTS_PER_SOL);
      console.log(`Success on ${url}! Signature:`, sig);
      return;
    } catch (e) {
      console.log(`Failed on ${url}:`, e.message);
    }
  }
}

main();
