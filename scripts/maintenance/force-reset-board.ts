
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function forceResetBoard() {
    console.log('--- [MAINTENANCE] AGGRESSIVE BOARD RESET START ---');

    const { data: resetTasks, error } = await supabase
        .from('trinity_tasks')
        .update({
            status: 'pending',
            claimed_by: null,
            started_at: null,
            verification_result: 'FORCE_RESET: Board cleared for Anti-Fragile Growth Mode launch.'
        })
        .in('status', ['doing', 'in_progress', 'running'])
        .select();

    if (error) {
        console.error('Reset error:', error.message);
        return;
    }

    if (resetTasks && resetTasks.length > 0) {
        console.log(`✅ Force-reset ${resetTasks.length} tasks back to pending.`);
        resetTasks.forEach(t => console.log(` - [${t.id}] ${t.title}`));
    } else {
        console.log('No active tasks found to reset.');
    }

    // Also clear the heartbeats to force fresh registrations
    await supabase.from('trinity_heartbeat').delete().neq('agent', 'SYSTEM');
    await supabase.from('agent_heartbeat').delete().neq('agent_name', 'SYSTEM');

    console.log('--- [MAINTENANCE] AGGRESSIVE BOARD RESET COMPLETE ---');
}

forceResetBoard();
