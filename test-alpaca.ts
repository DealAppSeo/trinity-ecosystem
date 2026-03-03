import { alpacaClient } from './lib/trading/AlpacaClient';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function testAlpaca() {
    console.log('--- Testing Alpaca Client ---');
    try {
        const account = await alpacaClient.getAccount();
        console.log('✅ Account retrieved:', {
            buying_power: account.buying_power,
            equity: account.equity,
            currency: account.currency
        });

        // Test Order (Market Buy 1 share of SPY - Paper Only)
        // console.log('--- Testing Plate Order (Mock/Paper) ---');
        // const order = await alpacaClient.placeOrder({
        //     symbol: 'SPY',
        //     qty: 1,
        //     side: 'buy',
        //     type: 'market',
        //     time_in_force: 'day'
        // });
        // console.log('✅ Order placed:', order.id);

    } catch (e: any) {
        console.error('❌ Alpaca Test Failed:', e.response?.data || e.message);
    }
}

testAlpaca();
