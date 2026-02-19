
import { spawn } from 'child_process';
import path from 'path';

const AGENTS = [
    'trinity-orch', 'trinity-w3c', 'trinity-shofet', 'trinity-gcm', 'trinity-hdm',
    'trinity-torch', 'trinity-veritas', 'trinity-apm', 'trinity-mel', 'trinity-chesed',
    'trinity-nexus', 'trinity-sophia'
];

async function rebootSwarm() {
    console.log('🚀 [REBOOT] Waking the Trinity Swarm...');

    for (const agent of AGENTS) {
        console.log(`[BOOT] Initiating ${agent}...`);

        // Spawn each agent as a detached hidden process (Powershell)
        const cmd = `Start-Process npx -ArgumentList "tsx scripts/run-agent.ts ${agent}" -WindowStyle Hidden`;

        spawn('powershell.exe', ['-Command', cmd], {
            detached: true,
            stdio: 'ignore'
        }).unref();

        // Stagger starts to avoid Supabase connection spikes
        await new Promise(r => setTimeout(r, 2000));
    }

    console.log('\n✅ [REBOOT] All agents triggered. Monitor the Dashboard for Green Dots.');
}

rebootSwarm();
