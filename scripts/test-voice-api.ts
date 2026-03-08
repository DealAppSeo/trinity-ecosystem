import * as dotenv from 'dotenv';
import path from 'path';

async function main() {
    const envPath = path.resolve(process.cwd(), '.env.hackathon');
    dotenv.config({ path: envPath });
    dotenv.config();

    console.log("🎙️ Testing Voice Endpoint (Text Input)...");

    // Test Case: Buy ETH $100
    const testData = { text: "Buy ETH $100" };

    try {
        const response = await fetch('http://localhost:3000/api/voice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testData)
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`API returned ${response.status}: ${err}`);
        }

        const result = await response.json();
        console.log("✅ Voice Endpoint Response:");
        console.log(JSON.stringify(result, null, 2));

        if (result.bft_triggered) {
            console.log("🚀 SUCCESS: BFT Vote Triggered correctly.");
        } else {
            console.warn("⚠️ Warning: BFT flag not found in response.");
        }
    } catch (e: any) {
        console.error("❌ Voice Test Failed:", e.message);
        console.log("Tip: Ensure 'npm run dev' is running.");
    }
}

main().catch(console.error);
