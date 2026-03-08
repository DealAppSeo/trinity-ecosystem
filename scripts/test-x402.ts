import { x402Middleware } from '../lib/x402/x402Middleware';

async function test() {
    console.log("🧪 Testing x402 Middleware...");

    try {
        const result = await x402Middleware.mockNexusSignalPurchase();
        console.log("🟢 Test Success:", result);
    } catch (e: any) {
        console.error("🔴 Test Failed:", e.message);
    }
}

test().catch(console.error);
