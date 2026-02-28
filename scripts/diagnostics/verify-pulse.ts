
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyStimulation() {
    console.log("📡 Verifying Swarm Stimulation (v2.7/v2.8)...\n");

    // 1. Agent Registy (Verify Recent Heartbeat)
    const { data: agents } = await supabase
        .from('trinity_agent_registry')
        .select('agent_name, last_active, status')
        .order('last_active', { ascending: false });

    console.log("🤖 Agent Pulse Check:");
    agents?.forEach(a => {
        const last = a.last_active ? new Date(a.last_active) : null;
        const diff = last ? (new Date().getTime() - last.getTime()) / 1000 : null; // seconds
        console.log(`- ${a.agent_name.padEnd(20)}: ${a.status.padEnd(10)} (Last: ${diff ? diff.toFixed(1) + 's ago' : 'N/A'})`);
    });

    // 2. Active Tasks (Check for Claims)
    const { data: activeTasks } = await supabase
        .from('trinity_tasks')
        .select('id, title, status, claimed_by, started_at')
        .in('status', ['doing', 'in_progress', 'running'])
        .order('started_at', { ascending: false });

    console.log("\n🚀 Currently Active Missions:");
    if (!activeTasks || activeTasks.length === 0) {
        console.log("  (No tasks currently in progress)");
    } else {
        activeTasks.forEach(t => {
            console.log(`- [#${String(t.id).padEnd(4)}] [${t.status.toUpperCase().padEnd(10)}] ${t.title} (Claimed by: ${t.claimed_by})`);
        });
    }

    // 3. Latest Agent Logs
    const { data: logs } = await supabase
        .from('trinity_agent_logs')
        .select('agent_name, message, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

    console.log("\n📜 Latest Agent Activity Logs:");
    if (!logs || logs.length === 0) {
        console.log("  (No logs found)");
    } else {
        logs.forEach(l => {
            console.log(`- [${new Date(l.created_at).toLocaleTimeString()}] [${l.agent_name}] ${l.message}`);
        });
    }
}

verifyStimulation().catch(console.error);
