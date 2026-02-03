import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function chunkedReset() {
    console.log('🚮 Starting Chunked Archive (to avoid timeout)...');

    let totalArchived = 0;
    const CHUNK_SIZE = 1000;

    while (true) {
        // 1. Find 1000 tasks to archive
        const { data: toArchive, error: fetchError } = await supabase
            .from('trinity_tasks')
            .select('id')
            .or('title.ilike.%ANTIFRAGILE%,title.ilike.%[WAKE]%,title.ilike.%repeated failure%')
            .neq('status', 'archived')
            .limit(CHUNK_SIZE);

        if (fetchError) {
            console.error('❌ Fetch Error:', fetchError.message);
            break;
        }

        if (!toArchive || toArchive.length === 0) {
            console.log('✅ No more tasks to archive.');
            break;
        }

        const ids = toArchive.map(t => t.id);

        // 2. Perform the update
        const { error: updateError } = await supabase
            .from('trinity_tasks')
            .update({ status: 'archived' })
            .in('id', ids);

        if (updateError) {
            console.error('❌ Update Error:', updateError.message);
            break;
        }

        totalArchived += ids.length;
        console.log(`📈 Archived ${totalArchived} tasks...`);
    }

    console.log('🔓 Unlocking valid tasks...');
    await supabase.from('trinity_tasks').update({
        status: 'todo',
        assigned_to: null,
        claimed_by: null,
        error_count: 0
    }).not('status', 'eq', 'archived').not('status', 'eq', 'verified');

    console.log('💓 Heartbeats were already cleaned in previous turn.');
}

chunkedReset();
