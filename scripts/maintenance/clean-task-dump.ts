import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectTasks() {
    console.log("--- PENDING TASK DUMP ---");
    const { data: tasks } = await supabase
        .from('trinity_tasks')
        .select('id, status, assigned_to, claimed_by, title, task_type')
        .eq('status', 'pending')
        .order('id', { ascending: false })
        .limit(20);

    tasks?.forEach(t => {
        console.log(`ID: ${t.id} | Type: ${t.task_type} | Assigned: ${t.assigned_to} | Claimed: ${t.claimed_by} | Title: ${t.title.substring(0, 40)}`);
    });

    const { count } = await supabase
        .from('trinity_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
    console.log(`Total Pending: ${count}`);
}

inspectTasks();
