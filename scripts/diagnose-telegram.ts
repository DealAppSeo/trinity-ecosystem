import * as dotenv from 'dotenv';
import path from 'path';

// Load local env vars
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function diagnose() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_OWNER_CHAT_ID;

    console.log('🔍 [Diagnostic] Starting Telegram Checkup...');
    console.log('-------------------------------------------');

    if (!token) {
        console.error('❌ Error: TELEGRAM_BOT_TOKEN is missing from .env.local');
        return;
    }
    console.log('✅ Token Found:', token.slice(0, 5) + '...' + token.slice(-5));

    if (!chatId) {
        console.error('❌ Error: TELEGRAM_OWNER_CHAT_ID is missing from .env.local');
        return;
    }
    console.log('✅ Chat ID Found:', chatId);

    console.log('📡 [Diagnostic] Pinging Telegram API...');
    try {
        const getMe = await fetch(`https://api.telegram.org/bot${token}/getMe`);
        const botData = await getMe.json();

        if (!botData.ok) {
            console.error('❌ Telegram API rejected your token:', botData.description);
            return;
        }
        console.log(`✅ Connection Successful! Bot Name: @${botData.result.username}`);

        console.log('💬 [Diagnostic] Attempting to send a test message to you...');
        const sendMsg = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: '🔔 *Symphony Check*: If you can see this, your bot connectivity is PERFECT! 🎼',
                parse_mode: 'Markdown'
            })
        });

        const msgData = await sendMsg.json();
        if (msgData.ok) {
            console.log('✅ TEST MESSAGE SENT! Check your Telegram app.');
        } else {
            console.error('❌ Failed to send message:', msgData.description);
            console.log('💡 Tip: Make sure you have actually messaged your bot and clicked "START" first!');
        }

    } catch (e: any) {
        console.error('❌ Network Error:', e.message);
    }
}

diagnose();
