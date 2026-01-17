
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(url, key);

async function listColumns(table) {
    console.log(`\n--- ${table} ---`);
    const { data, error } = await supabase.from(table).select('*').limit(1);

    if (data && data.length > 0) {
        console.log('Columns (from data):', Object.keys(data[0]).join(', '));
    } else {
        // Try information_schema via SQL if RPC fails or table is empty
        const { data: schema, error: schemaError } = await supabase.rpc('inspect_table_columns_v2', { t_name: table });
        if (schema) {
            console.log('Columns (from schema):', schema.map(c => c.column_name).join(', '));
        } else {
            console.log('No data to infer columns. Error:', error?.message || 'Table might be empty');
        }
    }
}

async function run() {
    await listColumns('trinity_agent_registry');
    await listColumns('trinity_tasks');
    await listColumns('trinity_artifacts');
    await listColumns('trinity_heartbeat');
}

run();
