import { supabase } from '../lib/supabase';

async function maintenance() {
    console.log("Cleaning up old tasks...");
    const { error } = await supabase.rpc('exec_sql', {
        query: "DELETE FROM public.trinity_tasks WHERE created_at < NOW() - INTERVAL '30 days'"
    });
    if (error) {
        console.error("Cleanup failed:", error.message);
    } else {
        console.log("Cleanup success.");
    }

    console.log("Re-enabling all user triggers...");
    const triggers = [
        'enforce_project_balance',
        'prevent_improved_spam',
        'trg_auto_lineage',
        'trg_auto_recur',
        'trg_bonus_prolific',
        'trg_task_completion_learning',
        'trigger_enforce_artifact',
        'trigger_spawn_next_stage',
        'trigger_spawn_on_completion',
        'trigger_throttle_healing',
        'update_trinity_tasks_updated_at'
    ];

    for (const t of triggers) {
        await supabase.rpc('exec_sql', { query: `ALTER TABLE public.trinity_tasks ENABLE TRIGGER ${t}` });
    }
    console.log("Triggers enabled.");
}

maintenance();
