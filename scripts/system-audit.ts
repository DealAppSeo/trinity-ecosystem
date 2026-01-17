import { supabase } from '../lib/supabase';

async function runAudit() {
    console.log("=== SYSTEM AUDIT START ===");

    // 1. Check Task Statuses
    const { data: tasks } = await supabase.from('trinity_tasks').select('id, title, status, assigned_to').order('created_at', { ascending: false }).limit(20);
    console.log("\n--- RECENT TASKS ---");
    console.table(tasks);

    // 2. Check Registry
    const { data: registry } = await supabase.from('trinity_agent_registry').select('agent_name, status, last_active').eq('status', 'active');
    console.log("\n--- AGENT REGISTRY (ACTIVE) ---");
    console.table(registry);

    // 3. Check Heartbeat
    const { data: hb } = await supabase.from('trinity_heartbeat').select('agent, last_seen').order('last_seen', { ascending: false }).limit(10);
    console.log("\n--- TRINITY HEARTBEAT ---");
    console.table(hb);

    // 4. Check Artifacts
    const { data: artifacts } = await supabase.from('trinity_artifacts').select('id, title, creator_agent, task_id').order('created_at', { ascending: false }).limit(10);
    console.log("\n--- RECENT ARTIFACTS ---");
    console.table(artifacts);

    console.log("\n=== SYSTEM AUDIT END ===");
}

runAudit();
