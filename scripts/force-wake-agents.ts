
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const coreAgents = [
    'trinity-orch', 'trinity-w3c', 'trinity-shofet',
    'trinity-torch', 'trinity-veritas', 'trinity-gcm',
    'trinity-chesed', 'trinity-mel', 'trinity-apm',
    'trinity-sophia', 'trinity-nexus', 'trinity-hdm'
];

async function forceWake() {
    console.log('--- 🌊 TRIGGERING SWARM CASCADE WAKE ---');
    const now = new Date().toISOString();

    // 1. Force Registry Status
    console.log('Updating registry status...');
    const { error: regError } = await supabase
        .from('trinity_agent_registry')
        .update({
            status: 'online',
            last_active: now,
            current_task_summary: '[WAKE] Neural pathways synchronized. Awaiting mission command.'
        })
        .in('agent_name', coreAgents);

    if (regError) console.error('Registry Error:', regError.message);
    else console.log('✅ Registry updated.');

    // 2. Force Heartbeats
    console.log('Updating heartbeat table...');
    const heartbeats = coreAgents.map(agent => ({
        agent,
        last_seen: now,
        status: 'active'
    }));

    const { error: hbError } = await supabase
        .from('trinity_heartbeat')
        .upsert(heartbeats, { onConflict: 'agent' });

    if (hbError) console.error('Heartbeat Error:', hbError.message);
    else console.log('✅ Heartbeats synced.');

    // 3. Force UI Status (SSOT parity)
    console.log('Updating UI status SSOT...');
    const statusUpdates = coreAgents.map(agent => ({
        agent_name: agent,
        status: 'online',
        last_active: now,
        current_task: '[REBOOT] Swarm wake signal received.'
    }));

    const { error: uiError } = await supabase
        .from('agent_status')
        .upsert(statusUpdates, { onConflict: 'agent_name' });

    if (uiError) console.error('UI Status Error:', uiError.message);
    else console.log('✅ UI Status synced.');

    // 4. Seed Keep-Alive Missions
    console.log('Seeding keep-alive missions...');
    const wakeTasks = coreAgents.map(agent => ({
        title: `[WAKE] System Pulse for ${agent.split('-')[1].toUpperCase()}`,
        description: 'System-wide keep-alive signal. Verify connection and resume tasking.',
        priority: 10,
        status: 'pending',
        assigned_to: agent,
        created_at: now,
        metadata: { type: 'wake', automated: true, created_by: 'FOUNDER' }
    }));

    const { error: taskError } = await supabase
        .from('trinity_tasks')
        .insert(wakeTasks);

    if (taskError) console.error('Task Seeding Error:', taskError.message);
    else console.log(`✅ Seeded ${coreAgents.length} wake signals.`);

    console.log('\n--- 🚀 CASCADE COMPLETE ---');
}

forceWake();
