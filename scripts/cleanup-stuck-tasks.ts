import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanupStuckTasks() {
    console.log('--- [MAINTENANCE] Cleaning up stuck tasks ---');

    // Define "stuck" as being in 'doing' or 'in_progress' for more than 30 minutes
    // Or in 'pending_clarification' for more than 2 hours with a claim
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const twoHoursAgo = new Date(Date.now() - 120 * 60 * 1000).toISOString();

    console.log('1. Flushing active stuck tasks (doing/in_progress > 30m)...');
    const { data: stuckTasks, error } = await supabase
        .from('trinity_tasks')
        .update({
            status: 'pending_clarification',
            claimed_by: null,
            started_at: null,
            result: `RESET: Task timed out (stuck in doing > 30m at ${new Date().toISOString()})`
        })
        .in('status', ['doing', 'in_progress', 'running'])
        .lt('started_at', thirtyMinutesAgo)
        .select();

    if (error) {
        console.error('Cleanup error (Phase 1):', error.message);
    } else if (stuckTasks && stuckTasks.length > 0) {
        console.log(`✅ Reset ${stuckTasks.length} active tasks.`);
        stuckTasks.forEach(t => console.log(` - [${t.id}] ${t.title}`));
    }

    console.log('\n2. Moving long-term clarification tasks back to pending for retry...');
    const { data: retryTasks, error: retryError } = await supabase
        .from('trinity_tasks')
        .update({
            status: 'pending',
            claimed_by: null,
            started_at: null
        })
        .eq('status', 'pending_clarification')
        .lt('created_at', twoHoursAgo) // If it's old, let someone else try
        .select();

    if (retryError) {
        console.error('Cleanup error (Phase 2):', retryError.message);
    } else if (retryTasks && retryTasks.length > 0) {
        console.log(`✅ Moved ${retryTasks.length} clarification tasks back to pending.`);
    }

    console.log('\n--- Cleanup Finished ---');
}

cleanupStuckTasks();
