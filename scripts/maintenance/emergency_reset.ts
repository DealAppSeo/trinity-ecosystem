import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function emergencyReset() {
    console.log('🚮 Archiving failing ANTIFRAGILE tasks...');

    // 1. Move failing tasks to archived
    const { error: archiveError } = await supabase
        .from('trinity_tasks')
        .update({ status: 'archived' })
        .or('title.ilike.%ANTIFRAGILE%,title.ilike.%[WAKE]%,title.ilike.%repeated failure%')
        .neq('status', 'archived');

    if (archiveError) {
        console.error('❌ Error archiving tasks:', archiveError.message);
    } else {
        console.log('✅ Archived looping tasks.');
    }

    console.log('🔓 Unlocking all other tasks...');
    // 2. Reset everything else to 'todo'
    const { error: resetError } = await supabase
        .from('trinity_tasks')
        .update({
            status: 'todo',
            assigned_to: null,
            claimed_by: null,
            started_at: null,
            error_count: 0
        })
        .not('status', 'eq', 'archived')
        .not('status', 'eq', 'verified');

    if (resetError) {
        console.error('❌ Error resetting tasks:', resetError.message);
    } else {
        console.log('✅ All valid tasks reset to TODO and unassigned.');
    }

    // 3. Purge heartbeats (force agents to re-register)
    console.log('💓 Cleaning stale heartbeats...');
    await supabase.from('trinity_heartbeat').delete().neq('agent', 'SYSTEM');
}

emergencyReset();
