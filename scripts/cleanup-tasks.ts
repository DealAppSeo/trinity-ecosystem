import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(url, key);

async function cleanup() {
    console.log('--- [TRINITY DB CLEANUP] ---');
    console.log('Objective: Prune massive task table to restore performance.');

    // 1. ARCHIVE THE ANCIENT OTHERS
    console.log('Archiving all pending/in_progress tasks older than 1 day to clear the queue...');
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { error: archiveError } = await supabase
        .from('trinity_tasks')
        .update({ status: 'archived' })
        .lt('created_at', yesterday)
        .neq('status', 'archived');

    if (archiveError) console.warn('Archive error:', archiveError.message);

    // 2. PURGE OLD ARCHIVED TASKS (BATCHED)
    console.log('Purging archived tasks older than 7 days...');
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { count, error: countError } = await supabase
        .from('trinity_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'archived')
        .lt('created_at', sevenDaysAgo);

    if (countError) {
        console.error('❌ Error counting tasks:', countError.message);
        return;
    }

    console.log(`Found ${count} tasks eligible for cleanup.`);

    if (count && count > 0) {
        // Delete in batches to avoid timeout
        const batchSize = 1000;
        let deletedTotal = 0;

        while (deletedTotal < count) {
            const { error: delError } = await supabase
                .from('trinity_tasks')
                .delete()
                .eq('status', 'archived')
                .lt('created_at', sevenDaysAgo)
                .order('created_at') // REQUIRED FOR LIMIT UNTIL PG UPDATE
                .limit(batchSize);

            if (delError) {
                console.error('❌ Batch deletion failed:', delError.message);
                break;
            }

            deletedTotal += batchSize;
            console.log(`Progress: Deleted ${Math.min(deletedTotal, count as number)} / ${count}`);
        }

        console.log('✅ Cleanup complete.');
    } else {
        console.log('No tasks found for cleanup. Check if tasks are marked as "completed" and have a "completed_at" date.');
    }
}

cleanup();
