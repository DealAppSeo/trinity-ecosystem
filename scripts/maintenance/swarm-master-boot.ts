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
    console.log('================================================');
    console.log('🚀 MOBILIZING TRINITY SYMPHONY: MISSION 2026');
    console.log('================================================');

    // 1. Wake Python Science Brain (PyBrain)
    console.log('[PYBRAIN] Waking Trinity Science Division...');
    const scienceLog = path.join(logsDir, 'trinity-science.log');
    const scOut = fs.openSync(scienceLog, 'a');

    // Attempt to run python main.py in trinity-science
    const pyProcess = spawn('python', ['main.py'], {
        cwd: path.resolve(process.cwd(), 'trinity-science'),
        detached: true,
        stdio: ['ignore', scOut, scOut],
        shell: true,
        windowsHide: true
    });
    pyProcess.unref();
    console.log('✅ PyBrain engaged. (Log: logs/swarm/trinity-science.log)');

    await new Promise(resolve => setTimeout(resolve, 5000));

    // 2. Wake all 12 TypeScript Agents
    for (const agent of agents) {
        const logFile = path.join(logsDir, `${agent}.log`);
        console.log(`[AGENT] Waking ${agent}...`);

        const out = fs.openSync(logFile, 'a');
        const err = fs.openSync(logFile, 'a');

        const agentProcess = spawn('npx', ['tsx', 'scripts/run-agent.ts', agent], {
            detached: true,
            stdio: ['ignore', out, err],
            shell: true,
            windowsHide: true
        });

        agentProcess.unref();

        // Staggered boot (3s)
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    console.log('================================================');
    console.log('🌟 SWARM MOBILIZED. OPERATION: PROGRESSIVE PROOF');
    console.log('================================================');
    process.exit(0);
}

bootSwarm();
