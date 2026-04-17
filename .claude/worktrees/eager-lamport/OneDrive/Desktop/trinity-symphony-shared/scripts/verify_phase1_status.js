const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'c:/Users/Cash4/OneDrive/Desktop/trinity-ecosystem/trinity-ecosystem/.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkTables() {
    console.log('--- Table Existence Verification ---');
    const { data, error } = await supabase.rpc('exec_sql', {
        query: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    });

    if (error) {
        console.error('❌ Error querying schema:', error.message);
        return;
    }

    const tablesToCheck = ['retrieval_logs', 'dag_nodes', 'dag_edges', 'agent_task_plans', 'agent_artifacts', 'hitl_settings'];
    const existingTables = (data || []).map(r => r.table_name);

    tablesToCheck.forEach(table => {
        if (existingTables.includes(table)) {
            console.log(`✅ ${table} exists`);
        } else {
            console.log(`❌ ${table} MISSING`);
        }
    });

    const { data: decisions, error: decError } = await supabase.rpc('exec_sql', {
        query: "SELECT count(*) FROM db_routing_decisions"
    });
    if (!decError && decisions && decisions.length > 0) {
        console.log(`📊 db_routing_decisions count: ${decisions[0].count}`);
    }
}

checkTables();
