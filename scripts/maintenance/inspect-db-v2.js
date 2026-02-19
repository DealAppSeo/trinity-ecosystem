
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
    console.error('❌ Missing credentials!');
    process.exit(1);
}

const supabase = createClient(url, key);

async function inspect(table) {
    console.log(`\n--- Inspecting ${table} ---`);
    const { data, error } = await supabase.from(table).select('*').limit(5);
    if (error) {
        console.error('Error:', error.message);
    } else {
        console.table(data);
    }
}

async function run() {
    await inspect('trinity_agent_registry');
    await inspect('trinity_tasks');
    await inspect('trinity_artifacts');
    await inspect('trinity_heartbeat');
}

run();
