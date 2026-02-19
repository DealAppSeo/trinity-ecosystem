const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials. Checked .env and .env.local for URL and KEY/ANON_KEY');
    console.log('Available Env Keys:', Object.keys(process.env).filter(k => k.includes('SUPABASE')));
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkStatus() {
    console.log('\n--- AGENT HEARTBEATS (AWAKE?) ---');
    const { data: heartbeats, error: hbError } = await supabase
        .from('trinity_heartbeat') // Check if this table exists or use 'agent_heartbeat' based on previous context
        .select('*')
        .order('last_seen', { ascending: false });

    if (hbError) {
        // Fallback to agent_heartbeat if trinity_heartbeat fails
        const { data: legacyHb } = await supabase.from('agent_heartbeat').select('*').order('last_ping', { ascending: false });
        if (legacyHb) {
            legacyHb.forEach(h => {
                const lastSeen = new Date(h.last_ping);
                const minsAgo = Math.floor((Date.now() - lastSeen) / 60000);
                const status = minsAgo < 5 ? '🟢 ONLINE' : (minsAgo < 60 ? '🟡 IDLE' : '🔴 OFFLINE');
                console.log(`${status} | ${h.agent_name.padEnd(10)} | Seen ${minsAgo}m ago`);
            });
        } else {
            console.log('Error fetching heartbeats:', hbError.message);
        }
    } else if (heartbeats) {
        heartbeats.forEach(h => {
            const lastSeen = new Date(h.last_seen);
            const minsAgo = Math.floor((Date.now() - lastSeen) / 60000);
            const status = minsAgo < 5 ? '🟢 ONLINE' : (minsAgo < 60 ? '🟡 IDLE' : '🔴 OFFLINE');
            console.log(`${status} | ${h.agent.padEnd(10)} | Seen ${minsAgo}m ago | Group: ${h.config?.group || 'N/A'}`);
        });
    }

    console.log('\n--- ACTIVE TASKS (BUSY?) ---');
    const { data: tasks, error: taskError } = await supabase
        .from('trinity_tasks')
        .select('id, title, assigned_to, status, created_at')
        .eq('status', 'in_progress');

    if (taskError) {
        console.log('Error fetching tasks:', taskError.message);
    } else if (tasks.length === 0) {
        console.log('No tasks currently in progress.');
    } else {
        tasks.forEach(t => {
            console.log(`[${t.assigned_to}] Working on: "${t.title}" (ID: ${t.id})`);
        });
    }
}

checkStatus();
