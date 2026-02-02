
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

async function flushJunk() {
    console.log('🌊 Aggressive Junk Flush Started...');

    // 1. Flush ALL failure_analysis first (clean slate for loops)
    console.log('Clearing failure_analysis...');
    await supabase.from('failure_analysis').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // 2. Clear known junk titles in batches
    while (true) {
        const { data: junkTasks, error: fetchError } = await supabase
            .from('trinity_tasks')
            .select('id')
            .or('title.ilike.%repeated failure%,title.ilike.%EVERGREEN%,title.ilike.%GENESIS%,title.ilike.%[HEALING]%,title.ilike.%[ANTIFRAGILE]%')
            .limit(1000);

        if (fetchError) {
            console.error('Error fetching junk tasks:', fetchError);
            break;
        }

        if (!junkTasks || junkTasks.length === 0) {
            console.log('✨ No more junk tasks found.');
            break;
        }

        const junkIds = junkTasks.map(t => t.id);
        console.log(`Clearing batch of ${junkIds.length} tasks...`);

        // Clear child tasks first
        await supabase.from('trinity_tasks').delete().in('parent_task_id', junkIds);

        // Clear other deps
        const depTables = ['trinity_artifacts', 'trinity_agent_logs', 'trinity_retros', 'trinity_research_log', 'trinity_agent_benchmarks'];
        for (const table of depTables) {
            await supabase.from(table).delete().in('task_id', junkIds);
            await supabase.from(table).delete().in('task_id', junkIds.map(id => String(id)));
        }

        // Final delete
        const { error: delError } = await supabase.from('trinity_tasks').delete().in('id', junkIds);
        if (delError) {
            console.error(`Batch delete error: ${delError.message}`);
            // If we hit a constraint, try to find what it is
            break;
        }
    }

    // 3. Reset stuck status
    console.log('Resetting stuck tasks...');
    await supabase.from('trinity_tasks').update({ status: 'pending', claimed_by: null }).eq('status', 'doing');

    console.log('✅ Swarm Decontaminated.');
}

flushJunk();
