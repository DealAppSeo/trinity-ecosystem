import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnose() {
    console.log('--- 🕵️ SWARM DEEP DIAGNOSTIC ---');

    const { data: agents } = await supabase.from('trinity_agent_registry').select('*').order('agent_name');
    const { data: tasks } = await supabase.from('trinity_tasks').select('*').order('created_at', { ascending: false }).limit(150);

    const now = new Date().getTime();

    const report = agents?.map(agent => {
        const lastSeen = agent.last_active;
        const lastSeenTime = lastSeen ? new Date(lastSeen).getTime() : 0;
        const minutesIdle = (now - lastSeenTime) / 60000;
        const isActive = minutesIdle < 5;
        const isIdle = minutesIdle >= 5 && minutesIdle < 60;

        const currentTask = tasks?.find(t => (t.claimed_by === agent.agent_name || t.assigned_to === agent.agent_name) && ['doing', 'in_progress', 'running', 'pending_clarification'].includes(t.status));
        const hasDoneTask = tasks?.some(t => t.claimed_by === agent.agent_name && t.status === 'done');

        let expectedStatus = 'offline';
        let reason = 'Not seen in > 60m';

        if (isActive) {
            if (currentTask?.status === 'pending_clarification') {
                expectedStatus = 'amber (Orange)';
                reason = `Task ${currentTask.id} stalled`;
            } else if (hasDoneTask) {
                expectedStatus = 'blue (Blue)';
                reason = 'Has completed work recently';
            } else {
                expectedStatus = 'online (Green)';
                reason = 'Active and healthy';
            }
        } else if (isIdle) {
            expectedStatus = 'amber (Orange)';
            reason = 'Idle for 5-60m';
        }

        return {
            agent: agent.agent_name,
            last_active: agent.last_active,
            min_idle: minutesIdle.toFixed(1),
            status: expectedStatus,
            reason: reason,
            current_task_id: currentTask?.id,
            current_task_status: currentTask?.status
        };
    });

    console.log(JSON.stringify(report, null, 2));
}

diagnose();
