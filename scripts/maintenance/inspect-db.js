
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

// Simple .env parser since we can't rely on dotenv package being present/configured for pure JS easily in this env
function loadEnv() {
    try {
        const envPath = path.resolve(__dirname, '../.env.local');
        const envFile = fs.readFileSync(envPath, 'utf8');
        const envVars = {};
        envFile.split('\n').forEach(line => {
            const [key, val] = line.split('=');
            if (key && val) envVars[key.trim()] = val.trim();
        });
        return envVars;
    } catch (e) {
        console.error("Could not load .env.local");
        return {};
    }
}

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing Credentials. URL:", !!supabaseUrl, "KEY:", !!supabaseKey);
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
    console.log("🔍 Inspecting 'trinity_artifacts'...");

    // Attempt to select 1 row
    const { data, error } = await supabase
        .from('trinity_artifacts')
        .select('*')
        .limit(1);

    if (error) {
        console.error("❌ Select Error:", error.message);
        return;
    }

    if (data && data.length > 0) {
        console.log("✅ Column Keys found in row:", Object.keys(data[0]));
    } else {
        console.log("⚠️ Table is empty. Trying to infer from error on bad insert...");

        // Try inserting a dummy row with a BAD column to see if it lists valid columns in error
        // Or try inserting with 'agent' (legacy) and see if it works
        const { error: errLegacy } = await supabase
            .from('trinity_artifacts')
            .insert({ task_id: 'debug', agent: 'DEBUG', artifact_type: 'debug', content_preview: 'dbg' });

        if (!errLegacy) {
            console.log("✅ Insert with 'agent' SUCCEEDED. Column is 'agent'.");
        } else {
            console.log("❌ Insert with 'agent' failed:", errLegacy.message);

            const { error: errNew } = await supabase
                .from('trinity_artifacts')
                .insert({ task_id: 'debug', agent_name: 'DEBUG', artifact_type: 'debug', content_preview: 'dbg' });

            if (!errNew) {
                console.log("✅ Insert with 'agent_name' SUCCEEDED. Column is 'agent_name'.");
            } else {
                console.log("❌ Insert with 'agent_name' failed:", errNew.message);
            }
        }
    }
}

inspect();
