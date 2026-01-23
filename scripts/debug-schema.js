
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(url, key);

async function listColumns(table) {
    try {
        console.log(`\n--- Checking Table: ${table} ---`);
        const { data, error } = await supabase.from(table).select('*').limit(1);

        if (error) {
            console.error(`Error fetching ${table}:`, error.message);
            return;
        }

        if (data && data.length > 0) {
            console.log(`[${table}] Columns found:`, Object.keys(data[0]).join(', '));
        } else {
            console.log(`[${table}] No data found. Table might be empty.`);
        }
    } catch (e) {
        console.error(`Exception during ${table} check:`, e.message);
    }
}

async function run() {
    await listColumns('trinity_agent_registry');
}

run();
