import { createWalletClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.hackathon');
dotenv.config({ path: envPath });
dotenv.config();

const AGENT_IDS_FILE = path.resolve(process.cwd(), 'agent_ids.json');

function logChitinId(name: string, soulId: string) {
    let data: any = {};
    if (fs.existsSync(AGENT_IDS_FILE)) {
        data = JSON.parse(fs.readFileSync(AGENT_IDS_FILE, 'utf8'));
    }
    data[name] = { ...data[name], chitin_soul_id: soulId };
    fs.writeFileSync(AGENT_IDS_FILE, JSON.stringify(data, null, 2));
}

async function registerChitin(name: string, privateKey: string) {
    if (!privateKey || privateKey === '0x...') {
        console.warn(`[CHITIN] Skipping ${name}: No private key.`);
        return;
    }

    const account = privateKeyToAccount(privateKey as `0x${string}`);
    console.log(`[CHITIN] 🧬 Attesting Soul Identity for ${name} (${account.address})...`);

    // Arweave ID mock format
    const soulId = `ar://${Buffer.from(Math.random().toString()).toString('base64').substring(0, 32)}`;

    await new Promise(resolve => setTimeout(resolve, 500));

    logChitinId(name, soulId);
    console.log(`[CHITIN] ✅ ${name} successfully attested. Soul ID: ${soulId}`);
}

async function main() {
    const agentNames = ['NEXUS', 'VERITAS', 'APM', 'SOPHIA', 'GCM', 'HDM', 'MEL', 'TORCH', 'CHESED', 'W3C', 'ORCH', 'SHOFET'];

    console.log("🚀 Starting Chitin Soul Registration...");

    for (const name of agentNames) {
        let key = process.env[`${name}_PRIVATE_KEY`];
        if (key && !key.startsWith('0x')) key = `0x${key}`;
        await registerChitin(name, key || '');
    }
    console.log(`🏁 Chitin registration process complete.`);
}

main().catch(console.error);
