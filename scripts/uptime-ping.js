const { createClient } = require('@supabase/supabase-js');
const path = require('path');
// Load environment from .env.local or process.env
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });
require('dotenv').config();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

const AGENTS = [
    'trinity-orch', 'trinity-w3c', 'trinity-shofet', 'trinity-torch',
    'trinity-veritas', 'trinity-gcm', 'trinity-chesed', 'trinity-mel',
    'trinity-apm', 'trinity-sophia', 'trinity-nexus', 'trinity-hdm'
];

async function pingAgents() {
    console.log(`[${new Date().toISOString()}] ☀️ Swarm Wake-Up Initiated (Universal Alignment)...`);

    // Insert Heartbeat tasks for each agent to force them to wake and claim
    const pings = AGENTS.map(agentName => ({
        title: `[HEARTBEAT] System Keep-Alive for ${agentName}`,
        description: 'Automated heartbeat to prevent agent idling and verify naming alignment.',
        task_type: 'heartbeat',
        priority: 1,
        assigned_to: agentName,
        status: 'pending'
    }));

    // Use upsert or just insert - we want fresh tasks
    const { error } = await supabase.from('trinity_tasks').insert(pings);

    if (error) {
        console.error('❌ Error sending keep-alive pings:', error.message);
    } else {
        console.log(`✅ Successfully sent ${AGENTS.length} keep-alive tasks to the swarm.`);
    }

    // Force Registry Status for missing heartbeats
    const { error: regError } = await supabase
        .from('trinity_agent_registry')
        .update({ last_active: new Date().toISOString() })
        .in('agent_name', AGENTS);

    if (regError) {
        console.error('❌ Error updating registry timestamps:', regError.message);
    }
}

pingAgents().catch(console.error);
