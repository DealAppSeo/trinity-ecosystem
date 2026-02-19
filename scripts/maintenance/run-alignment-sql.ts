import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import * as fs from 'fs';

// Load env from project root
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runSQL() {
    const rawSql = fs.readFileSync(resolve(__dirname, '../sql/EMERGENCY_ALIGNMENT_V9.sql'), 'utf8');

    // Note: Supabase JS client doesn't have a direct .query() method for arbitrary SQL.
    // We usually use a database function 'exec_sql' if we defined it, or we have to run it via CLI.
    // Since I don't know if 'exec_sql' exists, I'll try a common pattern or fallback to asking the user.

    console.log('Attempting to execute SQL via RPC...');
    const { error } = await supabase.rpc('exec_sql', { sql_query: rawSql });

    if (error) {
        console.warn('RPC exec_sql failed (might not exist):', error.message);
        console.log('As an alternative, please run the SQL manually in the Supabase Dashboard: /sql/EMERGENCY_ALIGNMENT_V9.sql');
    } else {
        console.log('SQL Executed successfully via RPC.');
    }
}

runSQL();
