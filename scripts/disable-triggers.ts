import { supabase } from '../lib/supabase';

async function disableUserTriggers() {
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
        'update_trinity_tasks_updated_at',
        'trigger_bft_aggregate'
    ];

    for (const t of triggers) {
        console.log(`Disabling ${t}...`);
        const { error } = await supabase.rpc('exec_sql', {
            query: `ALTER TABLE public.trinity_tasks DISABLE TRIGGER ${t}`
        });
        if (error) console.warn(`Failed to disable ${t}:`, error.message);
    }
}

disableUserTriggers();
