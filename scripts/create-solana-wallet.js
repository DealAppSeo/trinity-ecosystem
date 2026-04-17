// scripts/create-solana-wallet.js
const { Keypair } = require('@solana/web3.js');
const fs = require('fs');
const bs58 = require('bs58');

const sophia = Keypair.generate();
console.log("AGENT_SOPHIA_PUBKEY=" + sophia.publicKey.toBase58());

const privKey = bs58.default ? bs58.default.encode(sophia.secretKey) : bs58.encode(sophia.secretKey);

fs.writeFileSync('.env.local', `AGENT_SOPHIA_PRIVKEY=${privKey}\n`);
console.log("Wallet generated and saved to .env.local!");
