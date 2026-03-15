const { Coinbase, Wallet } = require("@coinbase/coinbase-sdk");
require("dotenv").config({ path: ".env.local" });

async function test() {
    console.log("🧪 Testing LIVE x402 Payment Bridge (JS Mode)...");

    try {
        // 1. Configure CDP
        Coinbase.configure({
            apiKeyName: process.env.COINBASE_API_KEY,
            privateKey: process.env.COINBASE_API_SECRET?.replace(/\\n/g, '\n')
        });

        console.log("🌐 Network: Base Sepolia");
        console.log("🛠️ Wallet Methods:", Object.keys(Wallet).filter(k => typeof Wallet[k] === 'function'));

        // 2. List Wallets
        let wallet;
        console.log("🔍 Checking for existing wallets...");
        try {
            const wallets = await Wallet.listWallets();
            if (wallets.data && wallets.data.length > 0) {
                wallet = wallets.data[0];
                console.log(`✅ Using existing wallet: ${wallet.getId()}`);
            } else if (Array.isArray(wallets) && wallets.length > 0) {
                wallet = wallets[0];
                console.log(`✅ Using existing wallet: ${wallet.getId()}`);
            } else {
                console.log("➕ No wallets found. Creating new one...");
                wallet = await Wallet.create({ networkId: 'base-sepolia' });
                console.log(`✅ New Wallet Created: ${wallet.getId()}`);
            }
        } catch (listErr) {
            console.warn("⚠️ Failed to list wallets, attempting creation:", listErr.message);
            wallet = await Wallet.create({ networkId: 'base-sepolia' });
            console.log(`✅ New Wallet Created: ${wallet.getId()}`);
        }

        // 3. Faucet (Testnet specific)
        try {
            console.log("🚰 Requesting faucet funds...");
            await wallet.faucet();
            console.log("✅ Faucet request sent.");
        } catch (f) {
            console.warn("⚠️ Faucet skipped:", f.message);
        }

        // 4. Transfer
        const destination = "0x8004f9998fe4af7c4489a6d94de301200e72A494BD9e";
        console.log(`💰 Transferring 0.0001 USDC to ${destination}...`);
        
        const transfer = await wallet.createTransfer({
            amount: 0.0001,
            assetId: 'usdc',
            destination: destination
        });

        console.log("⏳ Waiting for confirmation...");
        const tx = await transfer.wait();
        
        console.log("🟢 LIVE Test Success!");
        console.log("TX Hash:", tx.getTransactionHash());
        console.log("Explorer:", `https://sepolia.basescan.org/tx/${tx.getTransactionHash()}`);

    } catch (e) {
        console.error("🔴 LIVE Test Failed!");
        const errorData = {
            message: e.message,
            name: e.name,
            stack: e.stack,
            response: e.response ? e.response.data : null
        };
        require('fs').writeFileSync('scripts/error_log.json', JSON.stringify(errorData, null, 2));
        console.log("📝 Full error details written to scripts/error_log.json");
    }
}

test().catch(console.error);
