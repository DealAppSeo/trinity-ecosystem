import * as dotenv from 'dotenv';
import path from 'path';
async function sendTelegramAlert(message: string, botToken: string, chatId: string) {
    if (!botToken || !chatId) return;
    try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'Markdown'
            })
        });
    } catch (e) {
        console.error('[Telegram] ❌ Failed to send alert:', e);
    }
}

async function main() {
    const envPath = path.resolve(process.cwd(), '.env.hackathon');
    const localEnvPath = path.resolve(process.cwd(), '.env.local');
    dotenv.config({ path: envPath });
    dotenv.config({ path: localEnvPath });
    dotenv.config();

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_OWNER_CHAT_ID;

    if (!BOT_TOKEN || !CHAT_ID) {
        console.error("❌ BOT_TOKEN or CHAT_ID missing.");
        process.exit(1);
    }

    console.log("🚀 Sending Telegram Test Messages from 12 Agents (Direct Fetch)...");

    const agentNames = ['NEXUS', 'VERITAS', 'APM', 'SOPHIA', 'GCM', 'HDM', 'MEL', 'TORCH', 'CHESED', 'W3C', 'ORCH', 'SHOFET'];

    for (const name of agentNames) {
        process.stdout.write(`Sending for ${name}... `);
        try {
            await sendTelegramAlert(`🔔 *Test Notification* from [${name}]\nSwarm verification in progress. Final sprint: March 8.`, BOT_TOKEN, CHAT_ID);
            console.log("✅");
        } catch (e: any) {
            console.log(`❌ (${e.message})`);
        }
        await new Promise(r => setTimeout(r, 500));
    }

    console.log("🏁 All 12 test notifications sent.");
}

main().catch(console.error);
