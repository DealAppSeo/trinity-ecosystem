import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load env
const envPath = path.resolve(__dirname, '../.env.local');
dotenv.config({ path: envPath });

// Construct connection string for Supabase (Transaction Mode usually 6543, Session 5432)
// Default Supabase connection string format:
// postgres://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-ID].supabase.co:5432/postgres
// BUT we often only have the Service Role Key in this context, not the DB Password.
// Wait, the Service Role Key bypasses RLS via the API, it does NOT give direct PG access unless we have the password.

// CRITICAL CHECK:
// The user gave: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
// They did NOT give the Database Password.
// We CANNOT use 'pg' (node-postgres) without the password.
// We MUST use the Supabase JS Client.

// Re-evaluating strategy: 
// Supabase JS allows `rpc`. We can create a `exec_sql` RPC function?
// Or we just use the REST interface for everything (CRUD)?
// The user said "run SQL scripts directly".

// Strategy Shift:
// 1. We will try to use the `supabase-js` client.
// 2. We will stick to `select`, `insert` etc. for standard ops.
// 3. IF we really need RAW SQL, we can't without the password OR a custom RPC function named `exec_sql` that takes a query string.
// 
// Let's create a script that attempts to verify the specific 'sandbox_' tables exist using the JS client.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌ Missing Credentials");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function runCheck() {
    console.log("🔍 Checking Sandbox Connectivity...");

    // Try to selecting from the newly created table
    const { data, error } = await supabase
        .from('sandbox_agent_state')
        .select('*')
        .limit(5);

    if (error) {
        console.error("❌ Failed to query 'sandbox_agent_state':", error.message);
        // If it says 404/not found, the user didn't run the SQL.
    } else {
        console.log("✅ Success! 'sandbox_agent_state' is accessible.");
        console.log("   Row count:", data.length);
        console.log("   Rows:", data);

        // Let's insert a test agent to prove Write Access
        console.log("📝 Attempting write test...");
        const insert = await supabase
            .from('sandbox_agent_state')
            .insert([
                { agent_id: 'TEST_PROBE', current_task: 'Validation', status: 'ACTIVE' }
            ])
            .select();

        if (insert.error) {
            console.error("❌ Write failed:", insert.error.message);
        } else {
            console.log("✅ Write successful!", insert.data);
        }
    }
}

runCheck();
