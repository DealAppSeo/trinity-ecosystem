import { spawn } from 'child_process';
import path from 'path';

const agents = ['VERITAS', 'ORCH', 'APM'];

console.log(`🚀 Starting Swarm-Lite with agents: ${agents.join(', ')}...`);

agents.forEach(agent => {
    console.log(`🤖 Launching ${agent}...`);
    const proc = spawn('npx', ['tsx', 'scripts/run-agent.ts', agent], {
        stdio: 'inherit',
        shell: true,
        cwd: process.cwd()
    });

    proc.on('error', (err) => {
        console.error(`❌ Failed to start ${agent}:`, err.message);
    });

    proc.on('close', (code) => {
        console.log(`🛑 ${agent} process exited with code ${code}`);
    });
});
