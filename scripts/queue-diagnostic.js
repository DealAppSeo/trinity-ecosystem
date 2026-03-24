const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function runSQL() {
    const { data, error } = await supabase.from('trinity_tasks')
        .select('agent_assigned, status')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
        
    if (error) {
        console.error(error);
        return;
    }
    
    const counts = {};
    for (const d of data) {
        const key = `${d.agent_assigned}|${d.status}`;
        counts[key] = (counts[key] || 0) + 1;
    }
    
    // Sort and print
    const sorted = Object.entries(counts).sort((a,b) => a[0].localeCompare(b[0]));
    console.log("=== QUEUE DIAGNOSTIC ===");
    for (const [key, count] of sorted) {
        const [agent, status] = key.split('|');
        console.log(`Agent: ${agent.padEnd(10)} | Status: ${status.padEnd(15)} | Count: ${count}`);
    }
}
runSQL();
