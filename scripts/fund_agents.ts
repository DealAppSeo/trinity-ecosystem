import { createWalletClient, createPublicClient, http, parseEther } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import * as dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.hackathon');
dotenv.config({ path: envPath });
dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_OWNER_CHAT_ID;

async function sendTelegramAlert(message: string) {
    if (!BOT_TOKEN || !CHAT_ID) return;
    try {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CHAT_ID,
                text: message,
                parse_mode: 'Markdown'
            })
        });
    } catch (e) {
        console.error('[Telegram] ❌ Failed to send alert:', e);
    }
}

async function main() {
    const ORCH_KEY = process.env.ORCH_PRIVATE_KEY;
    if (!ORCH_KEY) {
        console.error("❌ ORCH_PRIVATE_KEY is missing. Funding aborted.");
        process.exit(1);
    }

    const account = privateKeyToAccount((ORCH_KEY.startsWith('0x') ? ORCH_KEY : `0x${ORCH_KEY}`) as `0x${string}`);
    const client = createWalletClient({ account, chain: baseSepolia, transport: http() });
    const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });

    const agents = ['NEXUS', 'VERITAS', 'APM', 'SOPHIA', 'GCM', 'HDM', 'MEL', 'TORCH', 'CHESED', 'W3C', 'SHOFET'];
    const amount = parseEther('0.02');

    console.log(`🚀 ORCH (${account.address}) starting fund_agents sprint...`);
    await sendTelegramAlert(`💸 *Agent Funding Started*\nORCH is sending 0.02 ETH to 11 agents...`);

    for (const name of agents) {
        let key = process.env[`${name}_PRIVATE_KEY`];
        if (!key) {
            console.warn(`[FUNDING] Skipping ${name}: No private key.`);
            continue;
        }
        if (!key.startsWith('0x')) key = `0x${key}`;
        const targetAddress = privateKeyToAccount(key as `0x${string}`).address;

        try {
            console.log(`[FUNDING] Sending 0.02 ETH to ${name} (${targetAddress})...`);
            const hash = await client.sendTransaction({
                to: targetAddress as `0x${string}`,
                value: amount,
                // @ts-ignore - Avoid KGZ requirement if misidentified
                kzg: undefined
            });
            console.log(`[FUNDING] ✅ Sent to ${name}: ${hash}`);
            await sendTelegramAlert(`✅ Sent 0.02 ETH to *${name}*\nTx: [${hash.substring(0, 10)}...](https://sepolia.basescan.org/tx/${hash})`);
        } catch (error: any) {
            console.error(`[FUNDING] ❌ Failed for ${name}:`, error.message);
        }
    }

    console.log(`🏁 Funding process complete.`);
    await sendTelegramAlert(`🏁 *Funding complete.* All agents are fueled for March 9.`);
}

main().catch(console.error);
