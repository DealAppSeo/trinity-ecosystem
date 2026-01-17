"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load env
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../.env.local') });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Service Role for full access
if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials in .env.local");
    process.exit(1);
}
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
async function inspectSchema() {
    console.log("🔍 INSPECTING DB SCHEMA...");
    // Check trinity_artifacts columns
    const { data: columns, error } = await supabase
        .rpc('get_schema_info', { table_name: 'trinity_artifacts' }); // RPC might not exist, let's use direct query if possible or just select * limit 1
    // Fallback: Try to just select * from the table and see the keys
    const { data, error: selectError } = await supabase
        .from('trinity_artifacts')
        .select('*')
        .limit(1);
    if (selectError) {
        console.error("❌ Error selecting from trinity_artifacts:", selectError.message);
    }
    else if (data && data.length > 0) {
        console.log("✅ trinity_artifacts columns:", Object.keys(data[0]));
    }
    else {
        console.log("⚠️ trinity_artifacts is empty. Cannot infer columns from data.");
        // If empty, we can't see columns via REST easily without metadata permissions or valid rows.
        // Let's try to insert a dummy row with 'agent_name' and see if it fails
        console.log("   Attempting test insert with 'agent_name'...");
        const { error: insertError } = await supabase
            .from('trinity_artifacts')
            .insert({
            task_id: 'schema-test',
            agent_name: 'TEST_AGENT',
            artifact_type: 'test',
            content_preview: 'test'
        });
        if (insertError) {
            console.error("   ❌ Insert failed:", insertError.message);
            console.log("   Attempting test insert with 'agent'...");
            const { error: insertError2 } = await supabase
                .from('trinity_artifacts')
                .insert({
                task_id: 'schema-test',
                agent: 'TEST_AGENT',
                artifact_type: 'test',
                content_preview: 'test'
            });
            if (insertError2) {
                console.error("   ❌ Insert with 'agent' failed too:", insertError2.message);
            }
            else {
                console.log("   ✅ Insert with 'agent' PASSED. Column is 'agent'.");
            }
        }
        else {
            console.log("   ✅ Insert with 'agent_name' PASSED. Column is 'agent_name'.");
        }
    }
    console.log("\n🔍 Checking trinity_tasks...");
    const { data: tasks, error: taskError } = await supabase
        .from('trinity_tasks')
        .select('*')
        .limit(1);
    if (tasks && tasks.length > 0) {
        console.log("✅ trinity_tasks columns:", Object.keys(tasks[0]));
    }
}
inspectSchema();
