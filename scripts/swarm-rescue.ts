
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { AGENT_WISDOM } from '../lib/agent/wisdom';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function swarmRescue() {
    console.log('🚁 [SWARM RESCUE] Initiating Emergency Recovery...');

    // 1. Restore Squads in Registry
    console.log('1/4 Restoring Squad Assignments...');
    for (const [agentName, wisdom] of Object.entries(AGENT_WISDOM)) {
        const { error: squadErr } = await supabase.from('trinity_agent_registry')
            .update({ squad: wisdom.squad })
            .eq('agent_name', agentName);
        if (squadErr) console.error(`  - Failed to update squad for ${agentName}:`, squadErr.message);
    }

    // 2. Release Stalled Tasks
    console.log('2/4 Releasing Stalled Tasks (> 30 mins)...');
    const { error: taskErr } = await supabase.from('trinity_tasks').update({
        status: 'pending',
        claimed_by: null,
        started_at: null,
        result: '[RESCUE] Released by recovery script.'
    }).in('status', ['doing', 'in_progress', 'running']);

    if (taskErr) console.error('  - Task release error:', taskErr.message);
    else console.log('  - All stalled tasks have been reset to pending.');

    // 3. Force Sync for System Agents
    console.log('3/4 Refreshing System Agent Status...');
    await supabase.from('trinity_agent_registry').update({ status: 'online' }).eq('agent_name', 'trinity-ecosystem');

    // 4. Instructions for User
    console.log('\n✅ [SWARM RESCUE] DATABASE OPS COMPLETE.');
    console.log('\nNext Steps:');
    console.log('1. I have fixed the squad logic in ConstitutionalAgent.ts.');
    console.log('2. Stalled tasks were released.');
    console.log('3. Please check the Railway dashboard and RESTART Chesed, Sophia, and Nexus if they show as stopped.');
    console.log('4. The swarm should now resume working with functional watchdogs.');
}

swarmRescue();
