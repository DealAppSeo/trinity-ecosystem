
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function ghostAudit() {
    console.log('--- [GHOST SWARM AUDIT] ---');
    console.log('Checking for cross-signaling and deployment conflicts...');

    // 1. Check Task Claims
    const { data: tasks } = await supabase
        .from('trinity_tasks')
        .select('id, claimed_by, started_at, status')
        .in('status', ['doing', 'in_progress', 'running']);

    console.log(`\nActive Task Claims: ${tasks?.length || 0}`);

    // 2. Check Registry
    const { data: registry } = await supabase
        .from('trinity_agent_registry')
        .select('*');

    const liveAgents = registry?.filter(a => (Date.now() - new Date(a.last_active).getTime()) < 600000) || [];
    console.log(`Live Agents (last 10m): ${liveAgents.length}`);

    // LOGIC: If an agent is 'online' but hasn't updated its task summary in a long time while the task IS 'doing',
    // it suggests the claiming agent process is dead but the registry row was last updated by a DIFFERENT process.

    for (const agent of liveAgents) {
        const assignedTask = tasks?.find(t => t.claimed_by === agent.agent_name);
        if (assignedTask) {
            const taskStart = new Date(assignedTask.started_at);
            const agentActive = new Date(agent.last_active);

            // If the agent is active NOW, but the task was started hours ago...
            const taskAgeHours = (Date.now() - taskStart.getTime()) / 3600000;
            if (taskAgeHours > 1) {
                console.log(`[CONFLICT?] Agent ${agent.agent_name} is ALIVE (seen ${Math.round((Date.now() - agentActive.getTime()) / 1000)}s ago), but Task ${assignedTask.id} was started ${taskAgeHours.toFixed(1)}h ago.`);
                console.log(`   -> Possible Scenario: The process that CLAIMED the task is dead, but a DIFFERENT deployment (Ghost) is heartbeating as this agent.`);
            }
        }
    }

    console.log('\nDeployment Clues:');
    for (const agent of registry || []) {
        if (agent.squad === null) {
            console.log(`[BAD REG] Agent ${agent.agent_name} has NO SQUAD. This likely came from a fresh deployment (Ghost) that isn't setting squad IDs.`);
        }
    }
}

ghostAudit();
