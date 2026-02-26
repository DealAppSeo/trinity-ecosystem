
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function runAudit() {
    const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    console.log("--- AGENT REGISTRY ---");
    const { data: registry, error } = await supabase
        .from('trinity_agent_registry')
        .select('agent_name, status, last_active, reputation_score, current_tier');

    if (error) console.error(error);
    else console.log(JSON.stringify(registry, null, 2));

    console.log("\n--- RECENT TASKS (Any Status) ---");
    const { data: recentTasks, error: err2 } = await supabase
        .from('trinity_tasks')
        .select('id, title, status, task_type, created_at')
        .order('created_at', { ascending: false })
        .limit(10);
    if (err2) console.error(err2);
    else console.log(JSON.stringify(recentTasks, null, 2));
}

runAudit();
