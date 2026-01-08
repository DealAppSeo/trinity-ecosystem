
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing Credentials.");
    console.log("URL:", supabaseUrl);
    console.log("KEY:", supabaseKey ? "FOUND" : "MISSING");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
    console.log("🔍 Inspecting 'trinity_artifacts'...");

    // 1. Try to get 1 row
    const { data, error } = await supabase.from('trinity_artifacts').select('*').limit(1);

    if (error) {
        console.error("❌ Select Error:", error.message);
    } else if (data && data.length > 0) {
        console.log("✅ Column Keys found in row:", Object.keys(data[0]));
    } else {
        console.log("⚠️ Table is empty. Running test inserts...");

        // 2. Test 'agent_name'
        const { error: err1 } = await supabase.from('trinity_artifacts').insert({
            task_id: 'schema_test',
            agent_name: 'TEST',
            artifact_type: 'test',
            content_preview: 'test'
        });

        if (!err1) {
            console.log("✅ 'agent_name' exists and works.");
        } else {
            console.log("❌ 'agent_name' failed:", err1.message);

            // 3. Test 'agent'
            const { error: err2 } = await supabase.from('trinity_artifacts').insert({
                task_id: 'schema_test',
                agent: 'TEST',
                artifact_type: 'test',
                content_preview: 'test'
            });

            if (!err2) {
                console.log("✅ 'agent' exists and works.");
            } else {
                console.log("❌ 'agent' also failed:", err2.message);
            }
        }
    }
}

inspect();
