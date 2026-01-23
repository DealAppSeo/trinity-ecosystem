
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function dumpCounts() {
    const { data: agents } = await supabase.from('trinity_agent_registry').select('agent_name, tasks_completed, reputation_score, status, last_active');
    console.log("AGENTS:");
    agents?.forEach(a => {
        console.log(`${a.agent_name}: tasks=${a.tasks_completed}, rep=${a.reputation_score}, status=${a.status}, last=${a.last_active}`);
    });

    const { data: tasks } = await supabase.from('trinity_tasks').select('status', { count: 'exact' });
    const counts = tasks?.reduce((acc: any, t: any) => {
        acc[t.status] = (acc[t.status] || 0) + 1;
        return acc;
    }, {});
    console.log("\nTASK STATUS COUNTS:", counts);
}
dumpCounts();
