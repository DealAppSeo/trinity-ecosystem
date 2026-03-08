import * as dotenv from 'dotenv';
import path from 'path';
import * as fs from 'fs';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http, formatEther } from 'viem';
import { baseSepolia } from 'viem/chains';

async function main() {
    const envPath = path.resolve(process.cwd(), '.env.hackathon');
    dotenv.config({ path: envPath });
    dotenv.config();

    const publicClient = createPublicClient({
        chain: baseSepolia,
        transport: http()
    });

    const agentNames = ['NEXUS', 'VERITAS', 'APM', 'SOPHIA', 'GCM', 'HDM', 'MEL', 'TORCH', 'CHESED', 'W3C', 'ORCH', 'SHOFET'];
    const results: any[] = [];

    console.log("🚀 Starting Batch Agent Wallet & Balance Verification...");

    for (const name of agentNames) {
        let key = process.env[`${name}_PRIVATE_KEY`];
        if (key && !key.startsWith('0x')) key = `0x${key}`;

        if (!key || key.length < 60) {
            console.warn(`[${name}] ⚠️ Missing or invalid private key.`);
            results.push({ name, status: 'FAILED', reason: 'Missing Key' });
            continue;
        }

        try {
            const account = privateKeyToAccount(key as `0x${string}`);
            const balance = await publicClient.getBalance({ address: account.address });
            const ethBalance = formatEther(balance);

            console.log(`[${name}] ✅ Wallet: ${account.address} | Balance: ${ethBalance} ETH`);
            results.push({
                name,
                status: ethBalance !== '0' ? 'PASS' : 'WARNING',
                address: account.address,
                balance: ethBalance
            });
        } catch (e: any) {
            console.error(`[${name}] ❌ Failed: ${e.message}`);
            results.push({ name, status: 'FAILED', reason: e.message });
        }
    }

    console.log("\n--- VERIFICATION SUMMARY ---");
    console.table(results);

    const LOG_FILE = path.resolve(process.cwd(), 'agent_init_log.json');
    fs.writeFileSync(LOG_FILE, JSON.stringify(results, null, 2));
    console.log(`\n📄 Results saved to ${LOG_FILE}`);
}

main().catch(console.error);
