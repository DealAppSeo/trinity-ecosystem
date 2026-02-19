import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

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

const logsDir = path.resolve(process.cwd(), 'logs', 'swarm');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

async function bootSwarm() {
    console.log(`--- FORCE MOBILIZING TRINITY SWARM: ${agents.length} AGENTS ---`);

    for (const agent of agents) {
        const logFile = path.join(logsDir, `${agent}.log`);
        console.log(`[BOOT] Waking ${agent} (Log: logs/swarm/${agent}.log)...`);

        const out = fs.openSync(logFile, 'a');
        const err = fs.openSync(logFile, 'a');

        const process = spawn('npx', ['tsx', 'scripts/run-agent.ts', agent], {
            detached: true,
            stdio: ['ignore', out, err],
            shell: true,
            windowsHide: true
        });

        process.unref();

        // Staggered boot
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    console.log('--- SWARM RELAUNCHED. CHECK logs/swarm/ FOR ERRORS ---');
    process.exit(0);
}

bootSwarm();
