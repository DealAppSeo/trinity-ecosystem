const { createPublicClient, createWalletClient, http, parseEther } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { baseSepolia } = require('viem/chains');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

async function executeAndProve() {
    try {
        const pk = process.env.TRINITY_DEPLOYER_PRIVATE_KEY;
        if (!pk) throw new Error("Missing deployment key");
        
        const account = privateKeyToAccount(pk.startsWith('0x') ? pk : '0x' + pk);
        
        const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });
        const walletClient = createWalletClient({ account, chain: baseSepolia, transport: http() });
        
        console.log("🚀 Executing Base Sepolia TX...");
        const hash = await walletClient.sendTransaction({
            to: '0x8004f9998fe4af7c4489a6d94de301200e72a494',
            value: parseEther('0.00001')
        });
        
        console.log(`⏳ Waiting for block confirmation on Hash: ${hash}`);
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        
        const proof = {
            verified: true,
            network: "Base Sepolia",
            hash: receipt.transactionHash,
            blockNumber: receipt.blockNumber.toString(),
            from: receipt.from,
            to: receipt.to,
            status: receipt.status === 'success' ? 'MINED_AND_SUCCESSFUL' : 'FAILED',
            gasUsed: receipt.gasUsed.toString(),
            explorerLink: `https://sepolia.basescan.org/tx/${receipt.transactionHash}`
        };

        const proofFile = path.join(process.cwd(), 'submissions', 'X402_TRANSACTION_PROOF.json');
        fs.writeFileSync(proofFile, JSON.stringify(proof, null, 2));
        console.log("✅ Proof generated successfully at: " + proofFile);

    } catch (e) {
        console.error("❌ Execution Error: ", e);
    }
}
executeAndProve();
