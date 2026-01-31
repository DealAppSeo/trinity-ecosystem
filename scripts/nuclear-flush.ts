
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function nuclearFlush() {
    console.log('☢️ [NUCLEAR FLUSH] Initiating Swarm Decontamination...');

    // 1. Clear Heartbeats (Clears the "Alive" signals from ghosts)
    console.log('1/4 Clearing Heartbeats...');
    const { error: hbErr } = await supabase.from('trinity_heartbeat').delete().neq('agent', 'system-sentinel');
    if (hbErr) console.error('  - Heartbeat clear error:', hbErr.message);

    // 2. Reset Agent Registry (Forces re-sync and squad fix)
    console.log('2/4 Resetting Agent Registry Status...');
    const { error: regErr } = await supabase.from('trinity_agent_registry').update({
        status: 'offline',
        current_task_summary: 'Reset by Nuclear Flush',
        squad: null // Force agents to re-set their squad on wake
    }).neq('agent_name', 'trinity-ecosystem');
    if (regErr) console.error('  - Registry reset error:', regErr.message);

    // 3. Release Stalled Task Claims
    console.log('3/4 Releasing Stalled Tasks...');
    const { error: taskErr } = await supabase.from('trinity_tasks').update({
        status: 'pending',
        claimed_by: null,
        started_at: null,
        result: '[FLUSH] Released due to swarm reconfiguration.'
    }).in('status', ['doing', 'in_progress', 'running']);
    if (taskErr) console.error('  - Task release error:', taskErr.message);

    // 4. Clear Logs (Optional, but helps focus on new session)
    console.log('4/4 Clearing recent session logs...');
    // We only clear the last hour to avoid losing long-term auditing
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const { error: logErr } = await supabase.from('trinity_logs').delete().gt('created_at', oneHourAgo);

    console.log('\n✅ [NUCLEAR FLUSH] COMPLETE.');
    console.log('The database is now clean. Please ensure you have DELETED the Ghost Railway projects before booting the main swarm.');
}

nuclearFlush();
