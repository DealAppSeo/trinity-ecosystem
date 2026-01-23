
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function verify() {
    console.log("--- AGENT REGISTRY ---");
    const { data: agents } = await supabase.from('trinity_agent_registry').select('agent_name, status, last_active, tasks_completed');
    agents?.forEach(a => {
        const lastActive = a.last_active ? new Date(a.last_active).toLocaleString() : 'Never';
        console.log(`${a.agent_name.padEnd(20)} | Status: ${String(a.status).padEnd(10)} | Last: ${lastActive} | Tasks: ${a.tasks_completed}`);
    });

    console.log("\n--- TASK SNAPSHOT ---");
    const { data: tasks } = await supabase.from('trinity_tasks').select('id, title, status, verify_count').order('updated_at', { ascending: false }).limit(20);
    tasks?.forEach(t => {
        console.log(`[${String(t.status).toUpperCase().padEnd(12)}] (VC:${t.verify_count}) ${t.title}`);
    });
}
verify();
