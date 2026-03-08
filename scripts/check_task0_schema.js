
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkSchema() {
    console.log('--- Checking Schemas ---');
    const tables = ['compute_bids', 'retrieval_logs', 'sprint_updates', 'trinity_tasks'];
    for (const table of tables) {
        console.log(`Table: ${table}`);
        const q = `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${table}' ORDER BY ordinal_position`;
        const { data, error } = await supabase.rpc('exec_sql', { query: q });
        if (error) {
            console.error(`Error checking ${table}:`, error.message);
        } else {
            console.log(JSON.stringify(data, null, 2));
        }
    }
}

checkSchema().catch(console.error);
