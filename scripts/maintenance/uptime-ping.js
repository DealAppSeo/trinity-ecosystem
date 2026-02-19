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
    console.log(`[${new Date().toISOString()}] ☀️ Zero-Cost Swarm Wake-Up (Registry Pulse)...`);

    // [ANTIGRAVITY] Task-less Waking: We update the registry directly 
    // to trigger the Railway container restart/health check without creating LLM tasks.
    const { error: regError } = await supabase
        .from('trinity_agent_registry')
        .update({
            last_active: new Date().toISOString(),
            status: 'online', // Ensure they show as online
            current_task_summary: '[WAKE] Receiving system pulse via UptimeRobot.'
        })
        .in('agent_name', AGENTS);

    if (regError) {
        console.error('❌ Error updating registry timestamps:', regError.message);
    } else {
        console.log(`✅ Successfully pulsed ${AGENTS.length} agents in the registry.`);
    }
}

pingAgents().catch(console.error);
