import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function watchdogPulse() {
    console.log('--- 🛡️ SYMPHONY WATCHDOG PULSE ---');

    const timeoutLimitMinutes = 15;
    const timeoutThreshold = new Date(Date.now() - timeoutLimitMinutes * 60000).toISOString();

    console.log(`🔍 Scanning for tasks stuck in 'doing' since before ${timeoutThreshold}...`);

    const { data: stuckTasks, error } = await supabase
        .from('trinity_tasks')
        .select('id, title, claimed_by, started_at')
        .in('status', ['doing', 'in_progress', 'running'])
        .lt('started_at', timeoutThreshold);

    if (error) {
        console.error('❌ Watchdog fetch error:', error.message);
        return;
    }

    if (!stuckTasks || stuckTasks.length === 0) {
        console.log('✅ No stuck tasks detected.');
    } else {
        console.log(`🚨 Found ${stuckTasks.length} stuck tasks. Initiating mass release...`);

        for (const task of stuckTasks) {
            console.log(`  - Releasing task ${task.id} ("${task.title}") from ${task.claimed_by || 'unknown'}`);

            const { error: releaseError } = await supabase
                .from('trinity_tasks')
                .update({
                    status: 'pending_clarification',
                    claimed_by: null,
                    result: `[WATCHDOG_PULSE] Automatically released after ${timeoutLimitMinutes}m of inactivity. Original claim: ${task.claimed_by}`,
                    metadata: {
                        watchdog_auto_released: true,
                        released_at: new Date().toISOString(),
                        original_claimer: task.claimed_by
                    }
                })
                .eq('id', task.id);

            if (releaseError) {
                console.error(`    ❌ Failed to release task ${task.id}:`, releaseError.message);
            } else {
                console.log(`    ✅ Task ${task.id} released.`);
            }
        }
    }

    console.log('--- WATCHDOG PULSE COMPLETE ---');
}

watchdogPulse();
