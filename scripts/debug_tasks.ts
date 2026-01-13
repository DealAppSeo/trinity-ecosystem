
import { supabase } from '../lib/supabase';

async function findTestTasks() {
    console.log("🔍 Searching for [TEST] Tasks...");

    const { data: tasks, error } = await supabase
        .from('trinity_tasks')
        .select('*')
        .ilike('title', '%[TEST%')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("❌ Error:", error.message);
        return;
    }

    if (!tasks || tasks.length === 0) {
        console.log("⚠️ No tasks found containing '[TEST' in title.");
    } else {
        console.log(`✅ Found ${tasks.length} Test Tasks:\n`);
        tasks.forEach(t => {
            console.log(`[${t.status.toUpperCase()}] ${t.title}`);
            console.log(`   👉 Assigned To: ${t.agent_assigned || t.claimed_by || 'Unassigned'} (Priority: ${t.priority})`);
            console.log(`   🆔 ID: ${t.id}\n`);
        });
    }

    // Also check active agents
    const { data: agents } = await supabase.from('trinity_agent_registry').select('agent_name, status, last_heartbeat');
    console.log("\n🤖 ACTIVE AGENTS (Heartbeat < 5min):");
    const now = new Date();
    const activeAgents = agents?.filter(a => {
        const hb = new Date(a.last_heartbeat);
        return (now.getTime() - hb.getTime()) < 5 * 60 * 1000;
    }) || [];

    if (activeAgents.length === 0) console.log("   (No active agents found)");
    activeAgents.forEach(a => console.log(`   • ${a.agent_name} (${a.status})`));
}

findTestTasks();
