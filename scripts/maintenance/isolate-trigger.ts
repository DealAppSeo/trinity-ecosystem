import { supabase } from '../lib/supabase';

async function isolateTrigger() {
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
        console.log(`--- Testing with ${t} DISABLED ---`);
        await supabase.rpc('exec_sql', { query: `ALTER TABLE public.trinity_tasks DISABLE TRIGGER ${t}` });

        const start = Date.now();
        const { error } = await supabase.from('trinity_tasks').insert({
            title: `Test ${t}`,
            description: `Testing if ${t} causes timeout.`
        });
        const duration = Date.now() - start;

        if (error && error.code === '57014') {
            console.log(`❌ Still timeout with ${t} disabled. Duration: ${duration}ms`);
            await supabase.rpc('exec_sql', { query: `ALTER TABLE public.trinity_tasks ENABLE TRIGGER ${t}` });
        } else if (error) {
            console.log(`✅ No timeout with ${t} disabled (but failed with error: ${error.message}). Duration: ${duration}ms`);
            console.log(`!!! FOUND POTENTIAL CULPRIT: ${t} !!!`);
            // Leave it disabled for now
        } else {
            console.log(`✅ Success with ${t} disabled! Duration: ${duration}ms`);
            console.log(`!!! FOUND POTENTIAL CULPRIT: ${t} !!!`);
            // Leave it disabled
        }
    }
}

isolateTrigger();
