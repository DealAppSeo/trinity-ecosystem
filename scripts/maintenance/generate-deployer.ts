import { ethers } from 'ethers';

async function generate() {
    const wallet = ethers.Wallet.createRandom();
    
    console.log('\n🌟 NEW TRINITY DEPLOYER WALLET GENERATED 🌟');
    console.log('-------------------------------------------');
    console.log('PUBLIC ADDRESS (Copy this for funding):');
    console.log(wallet.address);
    console.log('\nPRIVATE KEY (Save this to .env.local):');
    console.log(wallet.privateKey);
    console.log('-------------------------------------------');
    console.log('⚠️  IMPORTANT: Store this private key securely.');
    console.log('⚠️  Do NOT share this key with anyone.');
    console.log('-------------------------------------------\n');
}

generate().catch(console.error);
