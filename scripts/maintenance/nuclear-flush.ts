
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

    // 1. Clear Heartbeats (Move to ARCHIVED status instead of deleting)
    console.log('1/4 Archiving Heartbeats...');
    const { error: hbErr } = await supabase.from('trinity_heartbeat').update({
        status: 'offline',
        metadata: { archived_by: 'Nuclear Flush', archived_at: new Date().toISOString() }
    }).neq('agent', 'system-sentinel');
    if (hbErr) console.error('  - Heartbeat archive error:', hbErr.message);

    // 2. Reset Agent Registry (Forces re-sync and squad fix)
    console.log('2/4 Resetting Agent Registry Status...');
    const { error: regErr } = await supabase.from('trinity_agent_registry').update({
        status: 'offline',
        current_task_summary: '[ARCHIVED] Reset by Nuclear Flush',
        squad: null // Force agents to re-set their squad on wake
    }).neq('agent_name', 'trinity-ecosystem');
    if (regErr) console.error('  - Registry reset error:', regErr.message);

    // 3. Release Stalled Task Claims (Move to 'archived' if junk, or 'pending' if valuable)
    console.log('3/4 Archiving Stalled Tasks...');
    const { error: taskErr } = await supabase.from('trinity_tasks').update({
        status: 'archived',
        claimed_by: null,
        started_at: null,
        result: '[FLUSH] Archived due to swarm reconfiguration. Not deleted.'
    }).in('status', ['doing', 'in_progress', 'running']);
    if (taskErr) console.error('  - Task archive error:', taskErr.message);

    // 4. Preserve Logs (Do NOT delete, simply mark session)
    console.log('4/4 Marking end of current session in logs...');
    // Instead of deleting, we could insert a sentinel log entry
    await supabase.from('trinity_logs').insert({
        agent: 'system-sentinel',
        message: '☢️ [NUCLEAR FLUSH] Session terminated. All active state archived.',
        level: 'info',
        metadata: { action: 'NUCLEAR_FLUSH' }
    });

    console.log('\n✅ [NUCLEAR FLUSH] COMPLETE.');
    console.log('The database is now clean. Please ensure you have DELETED the Ghost Railway projects before booting the main swarm.');
}

nuclearFlush();
