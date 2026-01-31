import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function deepDiagnostic() {
    console.log('--- 🛡️ TRINITY DEEP DIAGNOSTIC ---');

    // 1. Check Heartbeats for all 12 Agents
    const expectedAgents = [
        'trinity-orch', 'trinity-w3c', 'trinity-shofet', 'trinity-torch',
        'trinity-veritas', 'trinity-gcm', 'trinity-chesed', 'trinity-mel',
        'trinity-apm', 'trinity-sophia', 'trinity-nexus', 'trinity-hdm'
    ];

    console.log('\n💓 Agent Pulse Check:');
    const { data: heartbeats } = await supabase.from('trinity_heartbeat').select('*');
    const hbMap = new Map(heartbeats?.map(h => [h.agent, h]));

    for (const agent of expectedAgents) {
        const hb = hbMap.get(agent);
        if (!hb) {
            console.log(`❌ ${agent}: NO HEARTBEAT FOUND`);
        } else {
            const lastSeen = new Date(hb.last_seen);
            const diffMins = (Date.now() - lastSeen.getTime()) / 60000;
            const status = diffMins < 2 ? '✅ ONLINE' : `⚠️ STALE (${Math.round(diffMins)}m ago)`;
            console.log(`${status} ${agent} | Squad: ${hb.squad || 'unknown'}`);
        }
    }

    // 2. Task Status Distribution
    console.log('\n📊 Task Pipeline Status:');
    const { data: statusCounts } = await supabase.rpc('get_task_status_counts'); // If exists, else manually
    const { data: allTasks } = await supabase.from('trinity_tasks').select('status, id, title, claimed_by, updated_at');

    const counts = allTasks?.reduce((acc: any, t) => {
        acc[t.status] = (acc[t.status] || 0) + 1;
        return acc;
    }, {});
    console.log(JSON.stringify(counts, null, 2));

    // 3. Inspect 'Doing' tasks
    console.log('\n🚧 Stalled "Doing" Tasks (>10 mins):');
    const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
    const stalling = allTasks?.filter(t => t.status === 'doing' && new Date(t.updated_at) < tenMinsAgo);
    if (stalling && stalling.length > 0) {
        stalling.forEach(t => console.log(` - [${t.id}] "${t.title}" | Claimed by: ${t.claimed_by} | Last Update: ${t.updated_at}`));
    } else {
        console.log('None.');
    }

    // 4. Artifact Audit
    console.log('\n🎨 Artifact Type Distribution:');
    const { data: artifacts } = await supabase.from('trinity_artifacts').select('artifact_type');
    const artCounts = artifacts?.reduce((acc: any, a) => {
        acc[a.artifact_type] = (acc[a.artifact_type] || 0) + 1;
        return acc;
    }, {});
    console.log(JSON.stringify(artCounts, null, 2));

    // 5. Recent Errors
    console.log('\n🔴 Recent Swarm Errors:');
    const { data: errors } = await supabase
        .from('trinity_agent_logs')
        .select('*')
        .eq('event_type', 'error')
        .order('created_at', { ascending: false })
        .limit(5);

    if (errors && errors.length > 0) {
        errors.forEach(e => console.log(`[${e.agent}] ${e.message} | ${e.created_at}`));
    } else {
        console.log('No recent error logs found.');
    }
}

deepDiagnostic();
