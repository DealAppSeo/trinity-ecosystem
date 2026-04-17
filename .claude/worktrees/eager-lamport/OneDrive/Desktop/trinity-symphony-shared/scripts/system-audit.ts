import { supabase } from '../lib/supabase';

async function runAudit() {
    console.log("=== SYSTEM TRINITY AUDIT START ===");

    // 1. ANOMALY DETECTION (Grok's Phase 1)
    console.log("\n--- 🔍 ANOMALY DETECTION ---");

    // A. Stalled Tasks (> 15 mins in 'doing' or 'in_progress')
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: stalled } = await supabase
        .from('trinity_tasks')
        .select('id, title, claimed_by, status, started_at')
        .in('status', ['doing', 'in_progress'])
        .lt('started_at', fifteenMinsAgo);

    if (stalled && stalled.length > 0) {
        console.warn(`⚠️ ALERT: ${stalled.length} STALLED TASKS DETECTED:`);
        console.table(stalled);
    } else {
        console.log("✅ No stalled tasks detected.");
    }

    // B. Multi-Tasking Violations (Busy Lock Bypass)
    const { data: claims } = await supabase
        .from('trinity_tasks')
        .select('claimed_by')
        .in('status', ['doing', 'in_progress']);

    const claimCounts = claims?.reduce((acc: any, c) => {
        if (c.claimed_by) acc[c.claimed_by] = (acc[c.claimed_by] || 0) + 1;
        return acc;
    }, {});

    const violators = Object.entries(claimCounts || {}).filter(([_, count]) => (count as number) > 1);
    if (violators.length > 0) {
        console.error(`🚨 ALERT: MULTI-TASKING VIOLATIONS DETECTED:`);
        console.table(violators.map(([agent, count]) => ({ agent, active_claims: count })));
    } else {
        console.log("✅ One-task-per-agent rule verified.");
    }

    // C. Agent Inactivity (Last seen > 5 mins)
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: inactive } = await supabase
        .from('trinity_heartbeat')
        .select('agent, last_seen')
        .lt('last_seen', fiveMinsAgo);

    if (inactive && inactive.length > 0) {
        console.warn(`⚠️ ALERT: ${inactive.length} INACTIVE AGENTS (Last 5m):`);
        console.table(inactive);
    }

    // 2. STATUS TABLES
    const { data: tasks } = await supabase.from('trinity_tasks').select('id, title, status, assigned_to').order('created_at', { ascending: false }).limit(10);
    console.log("\n--- RECENT TASKS ---");
    console.table(tasks);

    const { data: hb } = await supabase.from('trinity_heartbeat').select('agent, last_seen').order('last_seen', { ascending: false }).limit(5);
    console.log("\n--- HEARTBEAT SNAPSHOT ---");
    console.table(hb);

    const { data: artifacts } = await supabase.from('trinity_artifacts').select('id, title, creator_agent, task_id').order('created_at', { ascending: false }).limit(5);
    console.log("\n--- RECENT ARTIFACTS ---");
    console.table(artifacts);

    console.log("\n=== SYSTEM AUDIT END ===");
}

runAudit();
