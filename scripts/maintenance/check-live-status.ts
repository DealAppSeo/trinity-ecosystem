import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function check() {
    console.log('--- LIVE AGENT STATUS ---');
    const { data: agents } = await supabase
        .from('trinity_agent_registry')
        .select('agent_name, status, current_task_summary, last_active')
        .order('agent_name');

    if (agents) {
        agents.forEach(a => {
            const time = new Date(a.last_active).toLocaleTimeString();
            console.log(`[${a.agent_name}] ${a.status.toUpperCase()} | ${time} | ${a.current_task_summary || 'N/A'}`);
        });
    }

    console.log('\n--- RECENT TASKS ---');
    const { data: tasks } = await supabase
        .from('trinity_tasks')
        .select('title, status, claimed_by, verified_by')
        .order('priority', { ascending: false })
        .limit(10);

    if (tasks) {
        tasks.forEach(t => {
            console.log(`[${t.status.toUpperCase()}] ${t.title} | Completer: ${t.claimed_by || '?'} | Verifiers: ${t.verified_by?.length || 0}`);
        });
    }
}

check();
