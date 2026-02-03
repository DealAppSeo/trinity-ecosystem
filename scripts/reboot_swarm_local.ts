
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function rebootSwarm() {
    console.log('🔄 Manually Rebooting Swarm Nodes...');

    const agents = [
        'trinity-orch', 'trinity-w3c', 'trinity-shofet',
        'trinity-torch', 'trinity-veritas', 'trinity-gcm',
        'trinity-chesed', 'trinity-mel', 'trinity-apm',
        'trinity-sophia', 'trinity-nexus', 'trinity-hdm'
    ];

    const nowStr = new Date().toISOString();

    console.log('  1. Injecting [WAKE] tasks...');
    const wakeTasks = agents.map(agent => ({
        title: `[WAKE] Priority Pulse for ${agent}`,
        description: 'System-wide keep-alive signal. Verify connection and resume tasking.',
        priority: 10,
        status: 'todo',
        assigned_to: agent,
        created_at: nowStr
    }));

    await supabase.from('trinity_tasks').insert(wakeTasks);

    console.log('  2. Updating Registry Status to online...');
    await supabase
        .from('trinity_agent_registry')
        .update({
            status: 'online',
            last_active: nowStr
        })
        .in('agent_name', agents);

    console.log('  3. Upserting Heartbeats...');
    const heartbeats = agents.map(agent => ({
        agent,
        last_seen: nowStr,
        status: 'active'
    }));
    await supabase.from('trinity_heartbeat').upsert(heartbeats, { onConflict: 'agent' });

    console.log('✅ REBOOT COMMAND DISPATCHED.');
}

rebootSwarm();
