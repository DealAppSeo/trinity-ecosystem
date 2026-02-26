
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function runAudit() {
    const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    console.log("--- EVERGREEN STATUS ---");
    const { data: evergreenStats, error: err1 } = await supabase
        .from('trinity_tasks')
        .select('status')
        .eq('task_type', 'evergreen');

    if (err1) console.error(err1);
    else {
        const stats = evergreenStats.reduce((acc: any, t: any) => {
            acc[t.status] = (acc[t.status] || 0) + 1;
            return acc;
        }, {});
        console.log(JSON.stringify(stats, null, 2));
    }

    console.log("\n--- IN_PROGRESS EVERGREEN ---");
    const { data: inProgressEvergreen, error: err2 } = await supabase
        .from('trinity_tasks')
        .select('id, assigned_to, started_at, title')
        .eq('task_type', 'evergreen')
        .eq('status', 'in_progress');

    if (err2) console.error(err2);
    else console.log(JSON.stringify(inProgressEvergreen, null, 2));

    console.log("\n--- ALL STATUS DISTRIBUTION ---");
    const { data: allStats, error: err3 } = await supabase
        .from('trinity_tasks')
        .select('status');

    if (err3) console.error(err3);
    else {
        const stats = allStats.reduce((acc: any, t: any) => {
            acc[t.status] = (acc[t.status] || 0) + 1;
            return acc;
        }, {});
        console.log(JSON.stringify(stats, null, 2));
    }

    console.log("\n--- STUCK TASKS (>30 MINS) ---");
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: stuckTasks, error: err4 } = await supabase
        .from('trinity_tasks')
        .select('id, assigned_to, started_at, task_type')
        .eq('status', 'in_progress')
        .lt('started_at', thirtyMinsAgo);

    if (err4) console.error(err4);
    else console.log(JSON.stringify(stuckTasks, null, 2));

    console.log("\n--- LAST 10 COMPLETED TASKS ---");
    const { data: lastCompleted, error: err5 } = await supabase
        .from('trinity_tasks')
        .select('id, task_type, completed_at') // metadata omitted for now, check if spawned_task_id exists
        .eq('status', 'complete')
        .order('completed_at', { ascending: false })
        .limit(10);

    if (err5) console.log("Error or column missing:", err5.message);
    else console.log(JSON.stringify(lastCompleted, null, 2));

    // Try specifically for spawned_task_id
    console.log("\n--- CHECKING spawned_task_id COLUMN ---");
    const { data: colCheck, error: err6 } = await supabase
        .from('trinity_tasks')
        .select('spawned_task_id')
        .limit(1);
    if (err6) console.log("spawned_task_id does NOT exist.");
    else console.log("spawned_task_id exists.");
}

runAudit();
