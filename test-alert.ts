
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { sendIntelligenceAlert } from './lib/telegram/bot';

async function testAlert() {
    console.log("📡 Sending test intelligence alert...");
    await sendIntelligenceAlert({
        title: "BTC/USDT Pattern Detected",
        description: "Hybrid model (LSTM + TFT) detected a bullish divergence on the 4h timeframe.",
        confidence: 0.94,
        algorithms: ["LSTM", "TFT", "XGBoost"],
        opportunity: "Potential 5-8% upside over the next 48 hours."
    });
    console.log("✅ Test complete.");
}

testAlert().catch(console.error);
