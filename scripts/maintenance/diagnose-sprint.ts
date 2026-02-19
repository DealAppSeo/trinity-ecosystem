import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function diagnose() {
    console.log('--- 🛡️ SYMPHONY SPRINT DIAGNOSTIC ---');

    // 1. Task Status Breakdown
    const { data: tasks, error: taskError } = await supabase
        .from('trinity_tasks')
        .select('status, claimed_by, priority, title');

    if (taskError) {
        console.error('Task fetch error:', taskError.message);
        return;
    }

    const counts: Record<string, number> = {};
    tasks.forEach(t => {
        counts[t.status] = (counts[t.status] || 0) + 1;
    });

    console.log('\n📊 Task Distribution:');
    Object.entries(counts).forEach(([status, count]) => {
        console.log(`  - ${status.toUpperCase()}: ${count}`);
    });

    // 2. Doing Task Details
    const doingTasks = tasks.filter(t => ['doing', 'in_progress', 'running'].includes(t.status));
    console.log('\n🏃 Active Missions (Doing):');
    if (doingTasks.length === 0) console.log('  None');
    doingTasks.forEach(t => {
        console.log(`  - [${t.claimed_by || 'UNCLAIMED'}] ${t.title} (Priority: ${t.priority})`);
    });

    // 3. Clarify Column (Pending Clarification)
    const clarifyTasks = tasks.filter(t => t.status === 'pending_clarification');
    console.log('\n🤔 Clarify Column (Pending Clarification):');
    if (clarifyTasks.length === 0) console.log('  None');
    clarifyTasks.forEach(t => {
        console.log(`  - [${t.claimed_by || 'NO OWNER'}] ${t.title}`);
    });

    // 4. Agent Health Check
    const { data: agents, error: agentError } = await supabase
        .from('trinity_agent_registry')
        .select('agent_name, status, last_active, current_task_summary');

    if (agentError) {
        console.error('Agent fetch error:', agentError.message);
        return;
    }

    console.log('\n🤖 Agent Registry Status:');
    agents.sort((a, b) => a.agent_name.localeCompare(b.agent_name)).forEach(a => {
        const lastSeen = new Date(a.last_active || 0);
        const now = new Date();
        const diffMin = Math.floor((now.getTime() - lastSeen.getTime()) / 60000);
        const pulseIndicator = diffMin < 5 ? '🟢' : (diffMin < 15 ? '🟡' : '🔴');
        console.log(`  - ${pulseIndicator} ${a.agent_name}: ${a.status} (Last seen: ${diffMin}m ago)`);
        if (a.current_task_summary) {
            console.log(`    └─ ${a.current_task_summary}`);
        }
    });

    console.log('\n--- DIAGNOSTIC COMPLETE ---');
}

diagnose();
