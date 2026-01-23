import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(url, key);

async function cleanup() {
    console.log('--- [TRINITY ⚡ BATCHED CLEANUP] ---');

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // 1. BATCHED ARCHIVE (Cleanup the active queue)
    console.log('1. Archiving old pending/in_progress tasks...');
    let archiveDone = false;
    while (!archiveDone) {
        // We can't use .limit() on .update() directly in PostgREST easily without an RPC
        // So we fetch IDs first
        const { data: toArchive, error: fetchErr } = await supabase
            .from('trinity_tasks')
            .select('id')
            .neq('status', 'archived')
            .lt('created_at', yesterday)
            .limit(500);

        if (fetchErr || !toArchive || toArchive.length === 0) {
            archiveDone = true;
            break;
        }

        const { error: updateErr } = await supabase
            .from('trinity_tasks')
            .update({ status: 'archived' })
            .in('id', toArchive.map(t => t.id));

        if (updateErr) {
            console.error('❌ Archive batch failed:', updateErr.message);
            break;
        }
        console.log(`Archived ${toArchive.length} tasks...`);
    }

    // 2. LONG-TERM ARCHIVE (Instead of Purging)
    console.log('2. Transitioning archived tasks older than 7 days to permanent archive...');
    let permanentArchiveDone = false;
    while (!permanentArchiveDone) {
        const { data: toArchive, error: fetchErr } = await supabase
            .from('trinity_tasks')
            .select('id')
            .eq('status', 'archived')
            .lt('created_at', sevenDaysAgo)
            .limit(500);

        if (fetchErr || !toArchive || toArchive.length === 0) {
            permanentArchiveDone = true;
            break;
        }

        const { error: updErr } = await supabase
            .from('trinity_tasks')
            .update({
                status: 'archived_permanent',
                metadata: { archived_at: new Date().toISOString(), reason: 'long_term_retention' }
            })
            .in('id', toArchive.map(t => t.id));

        if (updErr) {
            console.error('❌ Permanent archive batch failed:', updErr.message);
            break;
        }
        console.log(`Permanently archived ${toArchive.length} tasks.`);
    }

    console.log('✅ Batched cleanup complete.');
}

cleanup();
