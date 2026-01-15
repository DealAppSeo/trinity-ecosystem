
import { supabaseAdmin } from '../lib/supabase';

async function resetStuckTasks() {
    console.log("🧹 Starting Admin Task Reset (Batched)...");

    const batchSize = 1000;

    // Helper for batched update
    const processBatch = async (status: string) => {
        let totalReset = 0;
        let hasMore = true;

        while (hasMore) {
            // 1. Fetch IDs to update
            const { data: batch, error: fetchError } = await supabaseAdmin
                .from('trinity_tasks')
                .select('id')
                .eq('status', status)
                .lt('updated_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
                .limit(batchSize);

            if (fetchError) {
                console.error(`Error fetching ${status}:`, fetchError);
                break;
            }

            if (!batch || batch.length === 0) {
                hasMore = false;
                break;
            }

            const ids = batch.map(t => t.id);

            // 2. Update these IDs
            const { error: updateError } = await supabaseAdmin
                .from('trinity_tasks')
                .update({ status: 'pending', assigned_to: null, updated_at: new Date().toISOString() })
                .in('id', ids);

            if (updateError) {
                console.error(`Error updating batch of ${status}:`, updateError);
                break; // Stop to prevent loop
            }

            totalReset += ids.length;
            console.log(`   - Reset batch of ${ids.length} (Total: ${totalReset})`);

            // Safety break for huge loops or simple test
            if (totalReset > 50000) break;
        }
        console.log(`✅ Finished resetting '${status}': ${totalReset} tasks.`);
    };

    await processBatch('in_progress');
    await processBatch('assigned');
    await processBatch('processing');
}

resetStuckTasks();
