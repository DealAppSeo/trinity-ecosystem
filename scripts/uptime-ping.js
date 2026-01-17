
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(url, key);

async function pingAgents() {
    console.log(`[${new Date().toISOString()}] ☀️ Swarm Wake-Up Initiated (Daily Railway Cron)...`);

    // 1. Get all registered agents
    const { data: agents } = await supabase
        .from('trinity_agent_registry')
        .select('agent_name')
        .eq('status', 'active');

    if (!agents) return;

    // 2. Insert Heartbeat/Wake tasks for each agent
    const pings = agents.map(agent => ({
        title: `[HEARTBEAT] Uptime Ping for ${agent.agent_name}`,
        description: 'Automated heartbeat to prevent agent idling.',
        task_type: 'heartbeat',
        priority: 1,
        assigned_to: agent.agent_name,
        status: 'pending'
    }));

    const { error } = await supabase.from('trinity_tasks').insert(pings);

    if (error) {
        console.error('Error sending pings:', error.message);
    } else {
        console.log(`Successfully pinged ${agents.length} agents.`);
    }
}

pingAgents();
