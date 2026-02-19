const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load env
const envPath = path.resolve(__dirname, '../.env.local');
dotenv.config({ path: envPath });

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
    } else {
        console.log("✅ Success! 'sandbox_agent_state' is accessible.");
        console.log("   Row count:", data.length);

        // Let's insert a test agent to prove Write Access
        console.log("📝 Attempting write test...");
        const { data: insertData, error: insertError } = await supabase
            .from('sandbox_agent_state')
            .insert([
                { agent_id: 'TEST_PROBE', current_task: 'Validation', status: 'ACTIVE' }
            ])
            .select();

        if (insertError) {
            console.error("❌ Write failed:", insertError.message);
        } else {
            console.log("✅ Write successful!", insertData);
        }
    }
}

runCheck();
