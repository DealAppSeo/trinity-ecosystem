import { spawn } from 'child_process';
import * as path from 'path';

const agents = [
    'trinity-orch',
    'trinity-w3c',
    'trinity-shofet',
    'trinity-torch',
    'trinity-veritas',
    'trinity-gcm',
    'trinity-chesed',
    'trinity-mel',
    'trinity-apm',
    'trinity-sophia',
    'trinity-nexus',
    'trinity-hdm'
];

async function bootSwarm() {
    console.log(`--- MOBILIZING TRINITY SWARM: ${agents.length} AGENTS ---`);
    console.log('--- MISSION: CONVERGENCE 2026 ---');

    for (const agent of agents) {
        console.log(`[BOOT] Waking agent: ${agent}...`);

        const fs = require('fs');
        const logFile = path.resolve(process.cwd(), 'logs', 'swarm', `${agent}.log`);
        const out = fs.openSync(logFile, 'a');

        const proc = spawn('npx', ['tsx', 'scripts/run-agent.ts', agent], {
            detached: true,
            stdio: ['ignore', out, out],
            shell: true
        });

        proc.unref();

        // Staggered boot to prevent DB contention
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log('--- SWARM ACTIVE. MONITOR VIA scripts/system-audit.ts ---');
    process.exit(0);
}

bootSwarm();
