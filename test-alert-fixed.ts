
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Dynamic import to ensure process.env is populated before lib/telegram/bot is initialized
import('./lib/telegram/bot').then(({ sendIntelligenceAlert }) => {
    console.log("📡 Sending fixed test intelligence alert...");
    sendIntelligenceAlert({
        title: "BTC/USDT Pattern Detected",
        description: "Hybrid model (LSTM + TFT) detected a bullish divergence on the 4h timeframe.",
        confidence: 0.94,
        algorithms: ["LSTM", "TFT", "XGBoost"],
        opportunity: "Potential 5-8% upside over the next 48 hours."
    }).then(() => {
        console.log("✅ Alert sent or suppressed (check logs).");
    });
}).catch(console.error);
