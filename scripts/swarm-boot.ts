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

        const logFile = path.resolve(process.cwd(), 'logs', 'swarm', `${agent}.log`);

        // Windows-specific robust background spawn
        const command = `npx tsx scripts/run-agent.ts ${agent} > "${logFile}" 2>&1`;

        spawn('powershell.exe', ['-Command', `Start-Process powershell.exe -ArgumentList '-Command', '${command.replace(/'/g, "''")}' -WindowStyle Hidden`], {
            detached: true,
            stdio: 'ignore'
        }).unref();

        // Staggered boot to prevent DB contention
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    console.log('--- SWARM ACTIVE. MONITOR VIA scripts/system-audit.ts ---');
    process.exit(0);
}

bootSwarm();
