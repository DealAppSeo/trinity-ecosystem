import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { ConstitutionalAgent } from '../lib/agent/ConstitutionalAgent';

const agentName = process.argv[2];

if (!agentName) {
    console.error("❌ Usage: ts-node scripts/run-agent.ts <AGENT_NAME>");
    process.exit(1);
}

async function startAgent() {
    console.log(`🤖 Starting Agent: ${agentName}...`);

    const agent = new ConstitutionalAgent({ name: agentName });
    await agent.syncState();

    console.log(`✅ ${agentName} is ONLINE (Tier: ${agent.autonomyTier}, Rep: ${agent.reputationScore})`);

    // The ConstitutionalAgent starts its healing loop in the constructor.
    // We just need to keep the process alive.
    // In a real implementation, we might call a main loop here like `agent.runLoop()`

    // Keep process alive
    setInterval(() => {
        // Heartbeat log every minute
        console.log(`[${agentName}] ❤️ Heartbeat - Process Active`);
    }, 60000);
}

startAgent().catch(err => {
    console.error(`💥 FATAL: Agent ${agentName} crashed:`, err);
    process.exit(1);
});
