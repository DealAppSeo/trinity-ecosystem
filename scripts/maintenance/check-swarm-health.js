
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

async function checkRegistry() {
    console.log('--- Agent Registry ---');
    const { data: agents, error } = await supabase.from('trinity_agent_registry').select('*');
    if (error) {
        console.error('Error:', error);
    } else {
        console.table(agents.map(a => ({
            name: a.agent_name,
            status: a.status,
            rep: a.reputation_score,
            tasks: a.tasks_completed,
            last_active: a.last_active
        })));
    }

    console.log('\n--- Heartbeats ---');
    const { data: heartbeats } = await supabase.from('trinity_heartbeat').select('*').order('last_seen', { ascending: false });
    const now = new Date();
    (heartbeats || []).forEach(hb => {
        const diff = now.getTime() - new Date(hb.last_seen).getTime();
        const mins = (diff / 60000).toFixed(1);
        const status = diff < 300000 ? '🟢 LIVE' : '🔴 STALE';
        console.log(`${status} ${hb.agent.padEnd(20)} ${mins} mins ago`);
    });

    console.log('\n--- Recent Errors ---');
    const { data: errors } = await supabase.from('trinity_runtime_errors').select('*').order('created_at', { ascending: false }).limit(5);
    (errors || []).forEach(e => {
        console.log(`[${e.severity}] ${e.agent_name}: ${e.error_message.substring(0, 100)}`);
    });

    // Check recent tasks
    const { data: tasks } = await supabase.from('trinity_tasks').select('status');
    // Group tasks by status
    const statusCounts = (tasks || []).reduce((acc, t) => {
        acc[t.status] = (acc[t.status] || 0) + 1;
        return acc;
    }, {});
    console.log('\nTask Status Summary:', statusCounts);
}

checkRegistry();
