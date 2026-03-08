import { createWalletClient, createPublicClient, http, parseAbi } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import path from 'path';
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

dotenv.config({ path: path.resolve(process.cwd(), '.env.hackathon') });
dotenv.config();

const IDENTITY_REGISTRY_ADDRESS = '0x8004A818BFB912233c491871b3d84c89A494BD9e';
const AGENT_IDS_FILE = path.resolve(process.cwd(), 'agent_ids.json');

const IDENTITY_REGISTRY_ABI = parseAbi([
    'function register(string calldata agentURI) external returns (uint256 agentId)',
    'function setAgentWallet(uint256 agentId, address wallet, bytes calldata proof) external',
    'function tokenURI(uint256 tokenId) external view returns (string)',
]);

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function logAgentId(name: string, id: string) {
    let data: any = {};
    if (fs.existsSync(AGENT_IDS_FILE)) {
        data = JSON.parse(fs.readFileSync(AGENT_IDS_FILE, 'utf8'));
    }
    data[name] = { ...data[name], erc8004_id: id };
    fs.writeFileSync(AGENT_IDS_FILE, JSON.stringify(data, null, 2));
}

async function registerAgent(
    name: string,
    privateKey: `0x${string}`,
    registrationURI: string
) {
    const account = privateKeyToAccount(privateKey);
    const client = createWalletClient({ account, chain: baseSepolia, transport: http() });
    const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });

    console.log(`[Registration] 🌉 Registering ${name} with URI: ${registrationURI}`);

    try {
        // 1. ERC-8004 register()
        const registerHash = await client.writeContract({
            address: IDENTITY_REGISTRY_ADDRESS,
            abi: IDENTITY_REGISTRY_ABI,
            functionName: 'register',
            args: [registrationURI],
        });

        console.log(`[Registration] Register Transaction sent: ${registerHash}`);
        const receipt = await publicClient.waitForTransactionReceipt({ hash: registerHash });

        const agentId = BigInt(receipt.logs[0].topics[3] ?? '0x0');
        console.log(`[Registration] ${name} Agent ID: ${agentId}`);

        // 2. Capture ID immediately in file and Supabase
        logAgentId(name, agentId.toString());
        await supabase.from('agent_registry').upsert({
            agent_name: name,
            erc8004_agent_id: Number(agentId),
            erc8004_chain: 'base-sepolia',
            registration_uri: registrationURI,
            wallet_address: account.address,
            wallet_verified: false, // Not yet verified
            registered_at: new Date().toISOString(),
        });

        // 3. Build EIP-712 proof
        const domain = {
            name: 'ERC-8004 Identity Registry',
            version: '1',
            chainId: 84532,
            verifyingContract: IDENTITY_REGISTRY_ADDRESS,
        };

        const types = {
            AgentWalletLink: [
                { name: 'agentId', type: 'uint256' },
                { name: 'wallet', type: 'address' },
            ],
        };

        const proof = await account.signTypedData({
            domain, types,
            primaryType: 'AgentWalletLink',
            message: { agentId, wallet: account.address },
        });

        // 4. Link Wallet (Optional Success)
        try {
            console.log(`[Registration] Linking wallet ${account.address} for ${name}...`);
            const setWalletHash = await client.writeContract({
                address: IDENTITY_REGISTRY_ADDRESS,
                abi: IDENTITY_REGISTRY_ABI,
                functionName: 'setAgentWallet',
                args: [agentId, account.address, proof as `0x${string}`],
            });

            await publicClient.waitForTransactionReceipt({ hash: setWalletHash });
            console.log(`[Registration] ✅ ${name} wallet linked.`);

            // Mark as verified
            await supabase.from('agent_registry').update({ wallet_verified: true }).eq('agent_name', name);

            // Success Alert
            await sendTelegramAlert(`✅ *${name}* registered & linked on ERC-8004\nToken ID: \`${agentId}\`\n[View on Explorer](https://sepolia.basescan.org/token/${IDENTITY_REGISTRY_ADDRESS}?a=${agentId})`);
        } catch (linkError: any) {
            console.warn(`[Registration] ⚠️ Wallet link failed for ${name} (ID: ${agentId}): ${linkError.message}`);
            await sendTelegramAlert(`⚠️ *${name}* registered but link failed.\nToken ID: \`${agentId}\``);
        }

        return agentId;
    } catch (error: any) {
        console.error(`[Registration] ❌ Critical failure for ${name}:`, error.message);
        await sendTelegramAlert(`❌ *Registration Failed* for ${name}: ${error.message}`);
    }
}

async function main() {
    const envPath = path.resolve(process.cwd(), '.env.hackathon');
    console.log(`[INIT] Loading Env from: ${envPath}`);
    dotenv.config({ path: envPath });
    dotenv.config();

    const agentNames = ['NEXUS', 'VERITAS', 'APM', 'SOPHIA', 'GCM', 'HDM', 'MEL', 'TORCH', 'CHESED', 'W3C', 'ORCH', 'SHOFET'];
    const agents = agentNames.map(name => {
        let key = process.env[`${name}_PRIVATE_KEY`];
        if (key && !key.startsWith('0x')) key = `0x${key}`;
        console.log(`[INIT] Check ${name}_PRIVATE_KEY: ${key ? `FOUND (${key.substring(0, 8)}...)` : 'MISSING'}`);
        return { name, key: key as `0x${string}` };
    });

    const availableAgents = agents.filter(a => a.key && a.key.length > 60);
    console.log(`🚀 Starting ERC-8004 Registration for ${availableAgents.length}/${agents.length} agents...`);

    if (availableAgents.length === 0) {
        console.error("❌ FATAL: No agents with valid private keys found.");
        process.exit(1);
    }

    for (const agent of availableAgents) {
        await registerAgent(
            agent.name,
            agent.key,
            `https://aitrinitysymphony.com/agents/${agent.name.toLowerCase()}/registration.json`
        );
    }
    console.log(`🏁 Registration process complete.`);
}

main().catch(console.error);
