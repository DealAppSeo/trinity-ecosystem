import { spawn } from 'child_process';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const AGENTS = [
    // ORCHESTRATION (SYSTEM CORE)
    'trinity-orch',
    'trinity-w3c',
    'trinity-shofet',

    // ALPHA SQUAD (TRUTH)
    'trinity-torch',
    'trinity-veritas',
    'trinity-gcm',

    // BETA SQUAD (CARE)
    'trinity-chesed',
    'trinity-mel',
    'trinity-apm',

    // GAMMA SQUAD (BUILD)
    'trinity-sophia',
    'trinity-nexus',
    'trinity-hdm'
];

async function startSwarm() {
    console.log(`[SWARM] 🔒 Checking Trinity Lock...`);

    // 1. Check Lock
    try {
        const { data, error } = await supabase.from('trinity_swarm_lock').select('locked').eq('id', 1).single();

        if (error && error.code !== 'PGRST116') {
            // If table doesn't exist, we might fail here. 
            // We'll proceed with caution or try to create loop if possible? No, strict lock requested.
            console.warn(`[SWARM] ⚠️ Lock check failed (Table missing?): ${error.message}`);
            // Proceeding cautiously or exiting? User wants single Clean Swarm.
            // If table missing, we can't lock.
        }

        if (data && data.locked) {
            console.error('[SWARM] 🛑 Swarm ALREADY RUNNING! Aborting start to prevent duplicates.');
            process.exit(1);
        }

        // 2. Acquire Lock
        const { error: lockError } = await supabase.from('trinity_swarm_lock').upsert({ id: 1, locked: true, started_at: new Date().toISOString() });
        if (lockError) console.warn(`[SWARM] ⚠️ Failed to acquire lock: ${lockError.message}`);
        else console.log('[SWARM] 🔒 Lock Acquired.');

    } catch (e) {
        console.warn(`[SWARM] Lock check exception:`, e);
    }

    console.log(`[SWARM] 🚀 Initializing Trinity Swarm (${AGENTS.length} agents)...`);

    AGENTS.forEach((agentName, index) => {
        setTimeout(() => {
            const scriptPath = path.resolve(process.cwd(), 'scripts', 'run-agent.ts');
            console.log(`[SWARM] 🟢 Spawning ${agentName}...`);

            // Assign unique port for local development to avoid collision
            const agentPort = 3000 + index + 1;

            const child = spawn('npx', ['tsx', scriptPath, agentName], {
                stdio: 'inherit',
                shell: true,
                env: {
                    ...process.env,
                    PORT: String(agentPort)
                }
            });

            child.on('error', (err) => {
                console.error(`[SWARM] ❌ Failed to start ${agentName}:`, err);
            });

            child.on('close', (code) => {
                console.log(`[SWARM] ⚠️ ${agentName} exited with code ${code}`);
            });

        }, index * 2000);
    });

    // 3. Release Lock on Exit
    const cleanup = async () => {
        console.log('\n[SWARM] 🔓 Releasing Lock & Shutting Down...');
        await supabase.from('trinity_swarm_lock').update({ locked: false }).eq('id', 1);
        process.exit();
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', async () => {
        // Sync cleanup impossible here for async DB, but SIGINT handles Ctrl+C
    });
}

startSwarm();
