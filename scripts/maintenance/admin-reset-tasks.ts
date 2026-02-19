import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function resetStuckTasks() {
    console.log("🧹 Starting Admin Task Reset (Batched)...");

    // Dynamic import to ensure process.env is populated by dotenv first
    const { supabaseAdmin } = require('../lib/supabase');

    // Allow passing status as an argument: npx tsx scripts/admin-reset-tasks.ts doing
    const argStatus = process.argv[2];
    const isForce = process.argv.includes('--force');
    const statusesToReset = argStatus && argStatus !== '--force' ? [argStatus] : ['in_progress', 'assigned', 'processing', 'doing'];

    const batchSize = 1000;

    // Helper for batched update
    const processBatch = async (status: string) => {
        let totalReset = 0;
        let hasMore = true;

        while (hasMore) {
            // 1. Fetch IDs to update
            let query = supabaseAdmin
                .from('trinity_tasks')
                .select('id')
                .eq('status', status);

            if (!isForce) {
                query = query.lt('updated_at', new Date(Date.now() - 30 * 60 * 1000).toISOString());
            }

            const { data: batch, error: fetchError } = await query.limit(batchSize);

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
                .update({
                    status: 'pending',
                    assigned_to: null,
                    claimed_by: null, // Clear claimed_by too
                    updated_at: new Date().toISOString()
                })
                .in('id', ids);

            if (updateError) {
                console.error(`Error updating batch of ${status}:`, updateError);
                break;
            }

            totalReset += ids.length;
            console.log(`   - Reset batch of ${ids.length} (Total: ${totalReset})`);

            if (totalReset > 50000) break;
        }
        console.log(`✅ Finished resetting '${status}': ${totalReset} tasks.`);
    };

    for (const status of statusesToReset) {
        await processBatch(status);
    }
}

resetStuckTasks();
