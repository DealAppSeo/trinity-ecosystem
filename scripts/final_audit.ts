
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function runAudit() {
    const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    console.log("--- EVERGREEN STATUS (COUNT) ---");
    const { count: todoCount } = await supabase.from('trinity_tasks').select('*', { count: 'exact', head: true }).eq('task_type', 'evergreen').eq('status', 'todo');
    const { count: doingCount } = await supabase.from('trinity_tasks').select('*', { count: 'exact', head: true }).eq('task_type', 'evergreen').eq('status', 'in_progress');
    const { count: doneCount } = await supabase.from('trinity_tasks').select('*', { count: 'exact', head: true }).eq('task_type', 'evergreen').eq('status', 'verified');
    console.log(`todo: ${todoCount}, in_progress: ${doingCount}, verified: ${doneCount}`);

    console.log("\n--- STUCK EVERGREEN (>30 MINS) ---");
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: stuckEvergreen } = await supabase
        .from('trinity_tasks')
        .select('id, assigned_to, started_at, title')
        .eq('task_type', 'evergreen')
        .eq('status', 'in_progress')
        .lt('started_at', thirtyMinsAgo);
    console.log(JSON.stringify(stuckEvergreen, null, 2));

    console.log("\n--- TASK STATUS DISTRIBUTION (CORE STATUSES) ---");
    const statuses = ['todo', 'pending', 'doing', 'in_progress', 'done', 'verified', 'failed', 'archived'];
    for (const status of statuses) {
        const { count } = await supabase.from('trinity_tasks').select('*', { count: 'exact', head: true }).eq('status', status);
        console.log(`${status}: ${count}`);
    }

    console.log("\n--- LAST 10 COMPLETED/VERIFIED TASKS ---");
    const { data: lastCompleted } = await supabase
        .from('trinity_tasks')
        .select('id, task_type, completed_at, status')
        .in('status', ['done', 'verified', 'complete'])
        .order('completed_at', { ascending: false })
        .limit(10);
    console.log(JSON.stringify(lastCompleted, null, 2));
}

runAudit();
