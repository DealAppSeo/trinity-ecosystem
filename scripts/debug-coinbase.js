const { Coinbase } = require("@coinbase/coinbase-sdk");
require("dotenv").config({ path: ".env.local" });

console.log("🔍 Checking Coinbase API Key:", process.env.COINBASE_API_KEY ? "EXISTS" : "MISSING");

try {
    Coinbase.configure({
        apiKeyName: process.env.COINBASE_API_KEY,
        privateKey: process.env.COINBASE_API_SECRET?.replace(/\\n/g, '\n')
    });
    console.log("✅ Coinbase configured successfully.");
} catch (e) {
    console.error("❌ Configuration failed:", e.message);
}
