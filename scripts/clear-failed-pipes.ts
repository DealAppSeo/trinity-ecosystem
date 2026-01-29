import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load ENV
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(url, key);

async function clearPipes() {
    console.log('🧹 [TRINITY PIPE CLEARING] Activating...');

    // 1. Archive recursive failure tasks
    console.log('📦 Archiving redundant [ANTIFRAGILE] and [HEALING] tasks...');
    const { data: archived, error: archiveError } = await supabase
        .from('trinity_tasks')
        .update({ status: 'archived' })
        .or('title.ilike.%[ANTIFRAGILE]%,title.ilike.%[HEALING]%')
        .in('status', ['pending', 'failed', 'pending_clarification']);

    if (archiveError) {
        console.error('❌ Archive failed:', archiveError.message);
    } else {
        console.log('✅ Backlog archived.');
    }

    // 2. Reset stalled claims (Tasks stuck in 'doing' for >30 mins)
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    console.log('🔓 Releasing stalled claims (>30 mins)...');
    const { error: unlockError } = await supabase
        .from('trinity_tasks')
        .update({
            status: 'pending',
            claimed_by: null,
            assigned_to: null
        })
        .in('status', ['doing', 'in_progress', 'running'])
        .lt('started_at', thirtyMinsAgo);

    if (unlockError) {
        console.error('❌ Unlock failed:', unlockError.message);
    } else {
        console.log('✅ Stalled claims released.');
    }

    // 3. Final Count
    const { count: pendingCount } = await supabase
        .from('trinity_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

    const { count: failedCount } = await supabase
        .from('trinity_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'failed');

    console.log(`\n📊 System Status Post-Cleanup:`);
    console.log(`   - Pending Tasks: ${pendingCount}`);
    console.log(`   - Failed Tasks (Non-Archived): ${failedCount}`);
    console.log('\n✨ Pipes cleared. Swarm should stabilize shortly.');
}

clearPipes().catch(console.error);
