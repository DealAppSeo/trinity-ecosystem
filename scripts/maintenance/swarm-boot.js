/**
 * TRINITY SWARM BOOTSTRAPPER
 * Activates all 12 agents in the Trinity Ecosystem.
 */

const { spawn } = require('child_process');
const path = require('path');

const AGENTS = [
    'APM', 'GCM', 'HDM', 'MEL', 'NEXUS', 'TORCH',
    'VERITAS', 'CHESED', 'SOPHIA', 'W3C', 'ORCH', 'SHOFET'
];

console.log('🚀 [TRINITY SWARM BOOTSTRAPPER] Starting 12 Agents...\n');

AGENTS.forEach((agent, index) => {
    setTimeout(() => {
        console.log(`🤖 Igniting ${agent}...`);

        const child = spawn('npx', ['tsx', 'scripts/run-agent.ts', agent], {
            cwd: path.resolve(__dirname, '..'),
            stdio: 'inherit',
            shell: true
        });

        child.on('error', (err) => {
            console.error(`❌ Failed to start agent ${agent}:`, err.message);
        });

    }, index * 2000); // Stagger boot to prevent Supabase connection spike
});

console.log('\n✅ All ignition sequences initiated. Monitor the logs or Dashboard for "Green Dots".');
