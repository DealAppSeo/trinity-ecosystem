import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function rebootSwarmPipeline() {
    console.log('☢️  SQUAD REBOOT: FLUSHING ALL ORPHANED CLAIMS');
    console.log('==========================================');

    // 1. Force release all 'doing' tasks that are claimed but stale-ish
    // Since this is a manual reboot, we are more aggressive
    console.log('🔄 Releasing all tasks currently in progress...');
    const { data: flushed, error } = await supabase
        .from('trinity_tasks')
        .update({
            status: 'pending',
            claimed_by: null,
            started_at: null,
            result: `REBOOT: Manual pipeline flush at ${new Date().toISOString()}`
        })
        .in('status', ['doing', 'in_progress', 'running', 'pending_clarification'])
        .select();

    if (error) {
        console.error('❌ Flush failed:', error.message);
    } else {
        console.log(`✅ Flushed ${flushed?.length || 0} tasks back to pending.`);
    }

    // 2. Clear stale heartbeats to force fresh registration
    console.log('\n🧹 Cleaning stale heartbeats...');
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { error: hbError } = await supabase
        .from('trinity_heartbeat')
        .delete()
        .lt('last_seen', fiveMinsAgo);

    if (hbError) {
        console.error('❌ Heartbeat cleanup failed:', hbError.message);
    } else {
        console.log('✅ Stale heartbeats cleared.');
    }

    console.log('\n🚀 Swarm Pipeline RESET. Agents will pick up tasks on next loop.');
}

rebootSwarmPipeline();
