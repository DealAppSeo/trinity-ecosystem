import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanupStuckTasks() {
    console.log('--- [MAINTENANCE] Cleaning up stuck tasks ---');

    // Define "stuck" as being in 'doing' or 'in_progress' for more than 30 minutes
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const { data: stuckTasks, error } = await supabase
        .from('trinity_tasks')
        .update({
            status: 'pending',
            claimed_by: null,
            started_at: null,
            verification_result: 'RESET: Task timed out (stuck in doing > 30m)'
        })
        .in('status', ['doing', 'in_progress'])
        .lt('started_at', thirtyMinutesAgo)
        .select();

    if (error) {
        console.error('Cleanup error:', error.message);
        return;
    }

    if (stuckTasks && stuckTasks.length > 0) {
        console.log(`✅ Reset ${stuckTasks.length} stuck tasks back to pending.`);
        stuckTasks.forEach(t => console.log(` - [${t.id}] ${t.title}`));
    } else {
        console.log('No stuck tasks detected.');
    }
}

cleanupStuckTasks();
