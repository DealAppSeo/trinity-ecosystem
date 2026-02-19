
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function diagnostic() {
    console.log('--- 🛡️ COMPREHENSIVE SYSTEM DIAGNOSTIC ---');
    console.log('Time:', new Date().toISOString());

    // 1. Agent Status
    console.log('\n🤖 AGENT REGISTRY & HEARTBEAT:');
    const { data: agents } = await supabase.from('trinity_agent_registry').select('*').order('agent_name');
    const { data: heartbeats } = await supabase.from('trinity_heartbeat').select('*');
    const { data: uiStatus } = await supabase.from('agent_status').select('*');

    const hbMap = new Map(heartbeats?.map(h => [h.agent, h]));
    const uiMap = new Map(uiStatus?.map(u => [u.agent_name, u]));

    const coreAgents = [
        'trinity-orch', 'trinity-w3c', 'trinity-shofet',
        'trinity-torch', 'trinity-veritas', 'trinity-gcm',
        'trinity-chesed', 'trinity-mel', 'trinity-apm',
        'trinity-sophia', 'trinity-nexus', 'trinity-hdm'
    ];

    agents?.forEach(a => {
        const hb = hbMap.get(a.agent_name);
        const ui = uiMap.get(a.agent_name);
        const isCore = coreAgents.includes(a.agent_name);
        const lastActive = new Date(a.last_active);
        const diffSecs = Math.round((Date.now() - lastActive.getTime()) / 1000);
        const statusStr = diffSecs < 300 ? '✅ LIVE' : `❌ STALE (${diffSecs}s)`;

        console.log(`[${a.agent_name}] ${isCore ? '(CORE)' : '(OFF)'} 
    Registry: ${a.status} | Last: ${a.last_active} | ${statusStr}
    Heartbeat: ${hb?.status || 'N/A'} | Seen: ${hb?.last_seen || 'N/A'}
    UI Status: ${ui?.status || 'N/A'} | Task: ${ui?.current_task || 'None'}`);
    });

    // 2. Task Breakdown
    console.log('\n📋 TASK METRICS:');
    const { data: tasks } = await supabase.from('trinity_tasks').select('status, assigned_to');
    const stats: Record<string, number> = {};
    tasks?.forEach(t => stats[t.status] = (stats[t.status] || 0) + 1);
    console.log('Stats:', stats);

    console.log('\n🚀 ACTIVE MISSIONS (doing/in_progress):');
    const activeTasks = tasks?.filter(t => ['doing', 'in_progress', 'running'].includes(t.status));
    activeTasks?.forEach(t => console.log(`   - Assigned to: ${t.assigned_to}`));

    // 3. Admin Keys Check
    console.log('\n🔑 ENV KEYS:');
    console.log('   MASTER_ACCESS_KEY set:', !!process.env.MASTER_ACCESS_KEY);
    console.log('   TRINITY_ADMIN_KEY set:', !!process.env.TRINITY_ADMIN_KEY);
    console.log('   Value of MASTER_ACCESS_KEY:', process.env.MASTER_ACCESS_KEY);

}

diagnostic();
