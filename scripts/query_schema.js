const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
    // Note: rpc('run_sql') might not exist unless we created it.
    // Let's try to query information_schema directly or use a dummy select
    const { data: tables, error: tableError } = await supabase
        .from('information_schema.tables')
        .select('*')
        .eq('table_schema', 'public');
    
    // Actually Supabase doesn't allow querying information_schema via the REST API by default.
    // Let's just try to fetch 1 row from the tables we think exist based on the codebase.
    const expectedTables = [
        'trinity_tasks',
        'trinity_agents',
        'trinity_agent_registry',
        'trinity_agent_logs',
        'trinity_heartbeat',
        'approval_queue',
        'trinity_hitl_requests'
    ];
    
    console.log("Checking tables...");
    for (const table of expectedTables) {
        const { data, error } = await supabase.from(table).select('*').limit(1);
        if (error) {
            console.log(`Table '${table}' error: ${error.message}`);
        } else {
            console.log(`Table '${table}' exists! Columns: ${data.length > 0 ? Object.keys(data[0]).join(', ') : 'No data, but table exists'}`);
        }
    }
}

run();
