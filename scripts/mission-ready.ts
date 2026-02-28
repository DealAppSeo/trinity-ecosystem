import { Telegraf } from 'telegraf';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local from the project root
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OWNER_ID = process.env.TELEGRAM_OWNER_CHAT_ID;

if (!BOT_TOKEN || !OWNER_ID) {
    console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_OWNER_CHAT_ID in .env.local');
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

const message = `
🎼 ANTIGRAV — READY
Mission: Landing page + audit + build queue
Mode: Autonomous (Tier 3 only)
Est. Tier 3 checkpoints: ~4-6 this mission

Starting Phase 1 in 60 seconds.
Send /pause to hold.
`;

async function main() {
    try {
        await bot.telegram.sendMessage(OWNER_ID, message, { parse_mode: 'Markdown' });
        console.log('✅ Mission Ready card sent to Telegram.');
    } catch (err) {
        console.error('❌ Failed to send Telegram message:', err);
        process.exit(1);
    }
}

main();
