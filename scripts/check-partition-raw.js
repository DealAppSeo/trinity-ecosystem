const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkPartitioning() {
    console.log('--- PARTITION STATUS CHECK (FIXED) ---');
    const queries = [
        "SELECT relname, relkind FROM pg_class WHERE relname = 'agent_artifacts'",
        "SELECT child.relname AS child_name FROM pg_inherits JOIN pg_class parent ON pg_inherits.inhparent = parent.oid JOIN pg_class child ON pg_inherits.inhrelid = child.oid WHERE parent.relname='agent_artifacts'"
    ];

    for (const q of queries) {
        const { data, error } = await supabase.rpc('exec_sql', { query: q });
        console.log(`Query: ${q}`);
        // exec_sql v2 returns the result directly for selects if handled correctly
        console.log(`Result: ${JSON.stringify(data, null, 2)}`);
        if (error) console.error(`Error: ${error.message}`);
    }
}

checkPartitioning();
