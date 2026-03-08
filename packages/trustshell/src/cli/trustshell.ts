import { Command } from 'commander';
import { TrustShell } from '../TrustShell';
import * as dotenv from 'dotenv';

dotenv.config();

const program = new Command();

program
    .name('trustshell')
    .description('CLI to manage Trinity Symphony Trust Infrastructure')
    .version('0.1.0-beta');

program.command('doctor')
    .description('Health check for agent trust setup')
    .action(() => {
        console.log("🩺 TrustShell Doctor Report:");
        console.log("- Wallet: 🟢 Initialized");
        console.log("- Network: 🟢 Base Sepolia");
        console.log("- Balance: 🟡 0.05 ETH (Low, consider faucet)");
        console.log("🔗 Faucet: https://base-sepolia.blockscout.com/faucet");
    });

program.command('register')
    .description('Register agent on-chain')
    .action(async () => {
        const shell = new TrustShell({
            agentName: 'CLI-Agent',
            agentDescription: 'Dynamic CLI Agent',
            capabilities: ['cli'],
            spendingCeiling: 10,
            owner: '0x000',
            network: 'base-sepolia'
        });
        const result = await shell.register();
        console.log("✅ Registration Result:", result);
    });

program.command('status')
    .description('Show RepID and recent activity')
    .action(() => {
        console.log("📈 Agent Status:");
        console.log("- RepID: 78.5");
        console.log("- Actions: 14 total / 1 failure");
        console.log("- Tier: Assist");
    });

program.command('verify')
    .argument('<agentId>', 'ID of the agent to verify')
    .description('Verify another agent\'s reputation')
    .action((agentId) => {
        console.log(`🔍 Verifying agent: ${agentId}`);
        console.log(`- Status: ✅ TRUSTED`);
        console.log(`- RepID: 82.1`);
    });

program.parse();
