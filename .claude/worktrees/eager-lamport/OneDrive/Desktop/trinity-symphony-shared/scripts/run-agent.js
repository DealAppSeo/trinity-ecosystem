
const ConstitutionalAgent = require('../lib/ConstitutionalAgentV4');

const agentName = process.argv[2];

if (!agentName) {
    console.error('Usage: node run-agent.js <AGENT_NAME>');
    process.exit(1);
}

// Ensure the agent name is set in the environment so the class picks it up
process.env.AGENT_NAME = agentName;

console.log(`[RUNNER] 🚀 Launching agent: ${agentName}`);

try {
    const agent = new ConstitutionalAgent({
        name: agentName
    });

    agent.start();
} catch (error) {
    console.error(`[RUNNER] ❌ Failed to start agent ${agentName}:`, error);
    process.exit(1);
}
