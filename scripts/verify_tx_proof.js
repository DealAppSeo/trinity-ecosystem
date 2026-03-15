const { createPublicClient, http } = require('viem');
const { baseSepolia } = require('viem/chains');
const fs = require('fs');
const path = require('path');

async function proveTransaction() {
    const txHash = "0xb25311d67a2cec006ef3f81611028422243be16ede9b9fc3d6ad1ffaae31ae886";
    const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });
    
    console.log("🔍 Querying Base Sepolia RPC for Tx: " + txHash);
    try {
        const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
        
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
        console.log(JSON.stringify(proof, null, 2));

    } catch (e) {
        console.error("❌ Failed to verify transaction: ", e.message);
    }
}

proveTransaction();
