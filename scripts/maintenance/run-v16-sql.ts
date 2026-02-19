import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import * as fs from 'fs';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runSQL() {
    const filePath = resolve(process.cwd(), 'sql/ULTIMATE_SWARM_RESET_V16.sql');
    const rawSql = fs.readFileSync(filePath, 'utf8');

    console.log(`Running ULTIMATE SWARM RESET from ${filePath}...`);
    const { error } = await supabase.rpc('exec_sql', { sql_query: rawSql });

    if (error) {
        console.warn('RPC exec_sql failed:', error.message);
        console.log('--- PLEASE RUN THE SQL MANUALLY IN SUPABASE DASHBOARD ---');
    } else {
        console.log('✅ Ultimate Swarm Reset Successful.');
    }
}

runSQL();
