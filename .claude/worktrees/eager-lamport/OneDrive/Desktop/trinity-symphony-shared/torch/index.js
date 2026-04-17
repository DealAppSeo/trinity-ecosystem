/**
 * TRANSMISSION: TORCH (V4 INJECTED)
 */
const ConstitutionalAgentV4 = require('./ConstitutionalAgentV4');

const rawName = process.env.AGENT_NAME;
const agentName = rawName || 'trinity-torch';

console.log(`[BOOT] 🚀 AGENT_NAME: ${agentName} (Source: ${rawName ? 'Environment' : 'Default/Fallback'})`);

const agent = new ConstitutionalAgentV4({
  name: agentName
});

agent.start();
