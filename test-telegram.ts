import { notificationManager } from './lib/notification/NotificationManager';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function testTelegram() {
    console.log('--- Testing Telegram Notification ---');
    try {
        const success = await notificationManager.sendTelegram('🚀 *Swarm Alert*: System upgrade successful. Alpaca Paper Trading and Telegram Bridge are now ACTIVE.');
        if (success) {
            console.log('✅ Telegram notification sent successfully.');
        } else {
            console.warn('⚠️ Telegram notification failed (check credentials).');
        }
    } catch (e: any) {
        console.error('❌ Telegram Notification Failed:', e.message);
    }
}

testTelegram();
