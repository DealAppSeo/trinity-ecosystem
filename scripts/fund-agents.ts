import { createWalletClient, http, parseEther, formatEther, publicActions } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.hackathon' });
dotenv.config();

const DEPLOYER_PK = process.env.TRINITY_DEPLOYER_PRIVATE_KEY as `0x${string}`;
const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL;

const AGENTS = [
    { name: 'ORCH', pk: process.env.ORCH_PRIVATE_KEY },
    { name: 'W3C', pk: process.env.W3C_PRIVATE_KEY },
    { name: 'SHOFET', pk: process.env.SHOFET_PRIVATE_KEY },
    { name: 'TORCH', pk: process.env.TORCH_PRIVATE_KEY },
    { name: 'GCM', pk: process.env.GCM_PRIVATE_KEY },
    { name: 'CHESED', pk: process.env.CHESED_PRIVATE_KEY },
    { name: 'NEXUS', pk: process.env.NEXUS_PRIVATE_KEY },
    { name: 'VERITAS', pk: process.env.VERITAS_PRIVATE_KEY },
    { name: 'MEL', pk: process.env.MEL_PRIVATE_KEY },
    { name: 'APM', pk: process.env.APM_PRIVATE_KEY },
    { name: 'SOPHIA', pk: process.env.SOPHIA_PRIVATE_KEY },
    { name: 'HDM', pk: process.env.HDM_PRIVATE_KEY }
];

async function notifyTelegram(message: string) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return;

    try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' })
        });
    } catch (e: any) {
        console.error(`[TELEGRAM] Error:`, e.message);
    }
}

async function main() {
    const isValidHex = (key: string | undefined) => {
        if (!key) return false;
        const clean = key.startsWith('0x') ? key.slice(2) : key;
        return clean.length === 64 && /^[0-9a-fA-F]+$/.test(clean);
    };

    if (!isValidHex(DEPLOYER_PK)) {
        console.error("❌ DEPLOYER_PK is invalid or placeholder.");
        await notifyTelegram(`🚨 *Agent Funding Failed*\nDeployer balance check blocked: Invalid Private Key.\n\nPlease set \`TRINITY_DEPLOYER_PRIVATE_KEY\` in your environment.\n\n🔗 [Base Sepolia Faucet](https://base-sepolia.blockscout.com/faucet)`);
        return;
    }

    if (!RPC_URL) {
        console.error("❌ RPC_URL missing.");
        return;
    }

    const account = privateKeyToAccount(DEPLOYER_PK);
    const client = createWalletClient({
        account,
        chain: baseSepolia,
        transport: http(RPC_URL)
    }).extend(publicActions);

    console.log(`\n🏦 Deployer Wallet: ${account.address}`);

    const balance = await client.getBalance({ address: account.address });
    const balanceEth = parseFloat(formatEther(balance));

    console.log(`💰 Current Balance: ${balanceEth.toFixed(4)} ETH`);

    if (balanceEth < 0.25) {
        console.error("❌ Insufficient balance ( < 0.25 ETH). Please use the faucet: https://base-sepolia.blockscout.com/faucet");
        return;
    }

    console.log(`🚀 Starting distribution to 11 agents (0.02 ETH each)...`);

    const results: any[] = [];
    // Skip deployer if it was in the list, but list only has agents. 
    // Wait, the list has 12 names. Let's see. 12 agents? 
    // ORCH, W3C, SHOFET, TORCH, GCM, CHESED, NEXUS, VERITAS, MEL, APM, SOPHIA, HDM. That's 12.
    // User said: "send 0.02 ETH to all 11 other agent wallets"
    // Usually ORCH is the 12th or first? 
    // Let's filter out the deployer if its PK matches.

    for (const agent of AGENTS) {
        if (!isValidHex(agent.pk)) {
            console.warn(`⚠️ Invalid PK for ${agent.name}. Skipping.`);
            continue;
        }

        const agentAccount = privateKeyToAccount(agent.pk as `0x${string}`);

        if (agentAccount.address === account.address) {
            console.log(`ℹ️ Skipping ${agent.name} (Address matches deployer).`);
            continue;
        }

        try {
            console.log(`💸 Funding ${agent.name} (${agentAccount.address})...`);
            const hash = await client.sendTransaction({
                to: agentAccount.address,
                value: parseEther('0.02')
            });
            console.log(`✅ Hash: ${hash}`);
            results.push({ name: agent.name, hash });
        } catch (e: any) {
            console.error(`❌ Failed to fund ${agent.name}:`, e.message);
        }
    }

    console.log(`\n🎉 Distribution Complete!`);
    console.table(results);
}

main().catch(console.error);
