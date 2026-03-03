
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const ALPACA_API_KEY = process.env.ALPACA_API_KEY!;
const ALPACA_SECRET_KEY = process.env.ALPACA_SECRET_KEY!;
const ALPACA_BASE_URL = 'https://paper-api.alpaca.markets/v2';

async function verifyAssets() {
    console.log('--- 🔍 VERIFYING ALPACA SYMBOLS (Step 3) ---');

    try {
        const res = await fetch(`${ALPACA_BASE_URL}/assets?asset_class=crypto`, {
            headers: {
                'APCA-API-KEY-ID': ALPACA_API_KEY,
                'APCA-API-SECRET-KEY': ALPACA_SECRET_KEY,
            }
        });

        if (!res.ok) {
            console.error(`Alpaca API error: ${res.status}`);
            return;
        }

        const assets = await res.json();
        const targets = ['DOT', 'AAVE', 'LTC', 'UNI'];
        const found = assets.filter((a: any) => targets.some(t => a.symbol.includes(t)));

        console.log('Results:');
        found.forEach((a: any) => {
            console.log(`✅ ${a.symbol} | Tradable: ${a.tradable} | Status: ${a.status}`);
        });

    } catch (e: any) {
        console.error('Fetch failed:', e.message);
    }
}

verifyAssets();
