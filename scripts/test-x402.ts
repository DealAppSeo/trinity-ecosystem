import { config } from 'dotenv';
config({ path: '.env.local' });

import { ERC8004Bridge } from '../lib/web3/erc8004';
async function test() {
    console.log("🧪 Testing LIVE x402 Payment Bridge...");

    try {
        // Test a small micropayment (0.0001 USDC) to a destination
        const destination = "0x8004f9998fe4af7c4489a6d94de301200e72a494";
        const result = await ERC8004Bridge.executeX402Payment(
            'NEXUS',
            0.0001,
            destination,
            'REPID-TEST-123'
        );
        
        console.log("🟢 LIVE Test Success:", JSON.stringify(result, null, 2));
    } catch (e: any) {
        console.error("🔴 LIVE Test Failed:", e.message);
    }
}

test().catch(console.error);
