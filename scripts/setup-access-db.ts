
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function runMigration() {
    console.log('🚀 Starting Access DB Migration...');

    const sqlPath = path.join(__dirname, '../sql/trinity_access_invites.sql');
    if (!fs.existsSync(sqlPath)) {
        console.error('❌ SQL file not found at:', sqlPath);
        process.exit(1);
    }

    const sql = fs.readFileSync(sqlPath, 'utf-8');

    // Split statements roughly by semicolon if needed, or try running as one block
    // Supabase JS client doesn't support generic SQL execution directly via client unless RPC is set up
    // BUT we can try using RPC if a generic exec function exists, OR just warn the user.
    // However, usually we might need to use the Postgres connection string with 'pg' package.

    // Check if 'exec_sql' rpc exists (common pattern in some setups)
    // If not, we might be stuck without direct SQL access from node script
    // unless we use 'pg' library and CONNECTION STRING.

    console.log('⚠️ NOTE: This script assumes you have an RPC function "exec_sql" or similar, OR you must run the SQL manually in Supabase Dashboard SQL Editor.');
    console.log('📄 SQL Content Preview:');
    console.log(sql.substring(0, 200) + '...');

    // Attempt RPC execution if available
    const { error } = await supabase.rpc('exec_sql', { sql });

    if (error) {
        console.log('⚠️ Automatic execution failed (RPC exec_sql missing?).');
        console.log('👉 ACTION REQUIRED: Copy contents of sql/trinity_access_invites.sql to Supabase SQL Editor.');
    } else {
        console.log('✅ Migration executed successfully via RPC!');
    }
}

runMigration().catch(console.error);
