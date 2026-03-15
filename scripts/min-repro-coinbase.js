const { Coinbase, Wallet } = require("@coinbase/coinbase-sdk");
require("dotenv").config({ path: ".env.local" });

async function run() {
    try {
        const keyName = process.env.COINBASE_API_KEY;
        const rawSecret = process.env.COINBASE_API_SECRET;
        const processedSecret = rawSecret?.replace(/\\n/g, '\n');

        console.log("🛠️ Key Name Length:", keyName?.length);
        console.log("🛠️ Secret Length (Raw):", rawSecret?.length);
        console.log("🛠️ Secret Length (Processed):", processedSecret?.length);
        console.log("🛠️ Secret Starts With:", processedSecret?.substring(0, 20));

        Coinbase.configure({
            apiKeyName: keyName,
            privateKey: processedSecret
        });
        console.log("🚀 CDP Configured.");
        
        console.log("🔍 Attempting listWallets...");
        const wallets = await Wallet.listWallets();
        console.log("✅ Success! Found:", wallets.data ? wallets.data.length : wallets.length);
        
    } catch (e) {
        console.error("❌ Error Name:", e.name);
        console.error("❌ Error Message:", e.message);
        if (e.response) {
             console.error("❌ Error Response:", JSON.stringify(e.response.data, null, 2));
        }
    }
}

run();
