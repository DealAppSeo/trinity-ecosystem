import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import * as fs from 'fs';

// Force load env
dotenv.config({ path: '.env.local' });
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runSQL() {
    const filePath = resolve(process.cwd(), 'sql/GHOST_BLOCKER_V20.sql');
    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return;
    }
    const rawSql = fs.readFileSync(filePath, 'utf8');

    console.log(`🚀 Running GHOST BLOCKER SQL from ${filePath}...`);
    const { error } = await supabase.rpc('exec_sql', { sql_query: rawSql });

    if (error) {
        console.error('❌ RPC exec_sql failed:', error.message);
        console.log('\n--- PLEASE RUN THIS SQL MANUALLY IN SUPABASE SQL EDITOR ---\n');
        console.log(rawSql);
        console.log('\n-----------------------------------------------------------\n');
    } else {
        console.log('✅ GHOST BLOCKER successfully deployed. Legacy agents are now blocked from work.');
    }
}

runSQL();
