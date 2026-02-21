import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectSchema() {
    console.log("=== INSPECTING SCHEMA FOR TIML ENTROPY PROXY ===");

    // Check trinity_tasks
    const { data: tasks, error: taskError } = await supabase
        .from('trinity_tasks')
        .select('*')
        .limit(1);

    if (taskError) {
        console.error("❌ Error fetching trinity_tasks:", taskError.message);
    } else if (tasks && tasks.length > 0) {
        console.log("✅ trinity_tasks columns:", Object.keys(tasks[0]));
    }

    // Check trinity_agent_logs
    const { data: logs, error: logError } = await supabase
        .from('trinity_agent_logs')
        .select('*')
        .limit(1);

    if (logError) {
        console.error("❌ Error fetching trinity_agent_logs:", logError.message);
    } else if (logs && logs.length > 0) {
        console.log("✅ trinity_agent_logs columns:", Object.keys(logs[0]));
        console.log("✅ sample metadata:", JSON.stringify(logs[0].metadata, null, 2));
    }
}

inspectSchema().then(() => process.exit(0));
