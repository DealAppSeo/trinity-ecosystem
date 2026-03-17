import { Telegraf } from 'telegraf';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || '');
const OWNER_ID = process.env.TELEGRAM_OWNER_CHAT_ID;

async function testTelegram() {
    if (!OWNER_ID) {
        console.log("No TELEGRAM_OWNER_CHAT_ID found in .env.local");
        return;
    }
    try {
        await bot.telegram.sendMessage(OWNER_ID, "🟢 *TRINITY DIAGNOSTIC TEST*\n\nYour Telegram bot is fully functional! If you receive this, the API keys are correct.\n\nThe overnight sprint notifications were missing because the sprint itself was not executed.", { parse_mode: 'Markdown' });
        console.log("SUCCESS: Telegram message sent to", OWNER_ID);
    } catch(e: any) {
        console.error("FAIL: Could not send Telegram message:", e.message);
    }
}

testTelegram();
