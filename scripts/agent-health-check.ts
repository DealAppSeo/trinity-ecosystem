import { createWalletClient, http, formatEther, publicActions } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environmental variables
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env.hackathon' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';

const AGENT_KEYS = [
    { name: 'DEPLOYER', env: 'TRINITY_DEPLOYER_PRIVATE_KEY' },
    { name: 'ORCH', env: 'ORCH_PRIVATE_KEY' },
    { name: 'W3C', env: 'W3C_PRIVATE_KEY' },
    { name: 'SHOFET', env: 'SHOFET_PRIVATE_KEY' },
    { name: 'TORCH', env: 'TORCH_PRIVATE_KEY' },
    { name: 'GCM', env: 'GCM_PRIVATE_KEY' },
    { name: 'CHESED', env: 'CHESED_PRIVATE_KEY' },
    { name: 'NEXUS', env: 'NEXUS_PRIVATE_KEY' },
    { name: 'VERITAS', env: 'VERITAS_PRIVATE_KEY' },
    { name: 'MEL', env: 'MEL_PRIVATE_KEY' },
    { name: 'APM', env: 'APM_PRIVATE_KEY' },
    { name: 'SOPHIA', env: 'SOPHIA_PRIVATE_KEY' },
    { name: 'HDM', env: 'HDM_PRIVATE_KEY' }
];

async function checkHealth() {
    console.log("🛡️ Trinity Swarm Health & Wallet Audit\n");
    console.log(`🌐 RPC: ${RPC_URL}`);
    console.log(`📊 Date: ${new Date().toLocaleString()}\n`);

    const client = createWalletClient({
        chain: baseSepolia,
        transport: http(RPC_URL)
    }).extend(publicActions);

    const report: any[] = [];

    // 1. Fetch Supabase Status
    const { data: registry } = await supabase
        .from('trinity_agent_registry')
        .select('agent_name, status, last_heartbeat');

    const statusMap = new Map();
    registry?.forEach(r => statusMap.set(r.agent_name.toUpperCase(), r));

    for (const item of AGENT_KEYS) {
        const pk = process.env[item.env];
        let address = 'MISSING';
        let balanceEth = '0.0000';
        let status = 'OFFLINE';
        let lastSeen = 'NEVER';

        if (pk && pk !== '0x...') {
            try {
                const account = privateKeyToAccount(pk.startsWith('0x') ? pk as `0x${string}` : `0x${pk}` as `0x${string}`);
                address = account.address;
                const balance = await client.getBalance({ address: account.address });
                balanceEth = parseFloat(formatEther(balance)).toFixed(4);
            } catch (e) {
                address = 'INVALID_PK';
            }
        }

        const reg = statusMap.get(item.name);
        if (reg) {
            status = reg.status;
            lastSeen = reg.last_heartbeat ? new Date(reg.last_heartbeat).toLocaleTimeString() : 'NEVER';
        }

        const alert = parseFloat(balanceEth) < 0.05 ? '⚠️ LOW' : '✅ OK';

        report.push({
            Agent: item.name,
            Status: status,
            Balance: `${balanceEth} ETH`,
            Funded: alert,
            LastSeen: lastSeen,
            Address: address
        });
    }

    console.table(report);

    const criticallyLow = report.filter(r => r.Funded === '⚠️ LOW' && r.Agent !== 'DEPLOYER');
    
    // Save to JSON for reliable parsing
    const fs = require('fs');
    fs.writeFileSync('scripts/health-report.json', JSON.stringify({
        timestamp: new Date().toISOString(),
        report,
        criticallyLow
    }, null, 2));

    if (criticallyLow.length > 0) {
        console.log(`\n🚨 ALERT: ${criticallyLow.length} agents are low on gas!`);
        console.log(`🔗 Faucet: https://faucet.quicknode.com/base/sepolia`);
    }
}

checkHealth().catch(console.error);
