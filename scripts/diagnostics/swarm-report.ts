
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing Supabase environment variables.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkProgress() {
    console.log("📊 Fetching Swarm Progress Report...\n");

    // 1. Agent Status
    const { data: agents } = await supabase
        .from('trinity_agent_registry')
        .select('agent_name, status, last_heartbeat')
        .order('agent_name');

    console.log("🤖 Agent Registry Status:");
    agents?.forEach(a => {
        const last = a.last_heartbeat ? new Date(a.last_heartbeat) : null;
        const diff = last ? (new Date().getTime() - last.getTime()) / 1000 / 60 : null; // minutes
        console.log(`- ${a.agent_name.padEnd(20)}: ${a.status.padEnd(10)} (Last Heartbeat: ${a.last_heartbeat || 'Never'} - ${diff ? diff.toFixed(1) + 'm ago' : 'N/A'})`);
    });

    // 2. Mission Status
    const { data: recentTasks } = await supabase
        .from('trinity_tasks')
        .select('id, title, status, metadata')
        .or('title.ilike.%crypto%,title.ilike.%arbitrage%')
        .order('created_at', { ascending: false })
        .limit(10);

    console.log("\n📋 Crypto/Arbitrage Mission History:");
    recentTasks?.forEach(t => {
        console.log(`- [#${String(t.id).padEnd(4)}] [${t.status.toUpperCase().padEnd(10)}] ${t.title}`);
    });

    // 3. Runtime Errors
    const { data: errors } = await supabase
        .from('trinity_runtime_errors')
        .select('agent_id, error_message, stack_trace, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

    console.log("\n⚠️ Latest System Errors:");
    errors?.forEach(e => {
        console.log(`- [${e.created_at}] [${e.agent_id}] ${e.error_message?.substring(0, 100)}...`);
    });

    // 4. Research Findings
    const { data: findings } = await supabase
        .from('trinity_research_log')
        .select('agent_id, topic, findings, created_at')
        .or('topic.ilike.%crypto%,topic.ilike.%arbitrage%,findings.ilike.%crypto%,findings.ilike.%arbitrage%')
        .order('created_at', { ascending: false })
        .limit(10);

    console.log("\n🧬 Crypto Research Intelligence:");
    if (!findings || findings.length === 0) {
        console.log("  (No specific crypto intelligence recorded yet)");
    } else {
        findings.forEach(f => {
            console.log(`- [${new Date(f.created_at).toLocaleDateString()}] [${f.agent_id}] ${f.topic}: ${f.findings?.substring(0, 150)}...`);
        });
    }

    // 5. Retros
    const { data: retros } = await supabase
        .from('trinity_retros')
        .select('agent_id, success_rating, cost_saved, summary')
        .order('created_at', { ascending: false })
        .limit(5);

    console.log("\n📝 Latest Retrospectives:");
    retros?.forEach(r => {
        console.log(`- [${r.agent_id}] Success: ${r.success_rating}/10 ($${r.cost_saved} saved) - ${r.summary?.substring(0, 100)}...`);
    });
}

checkProgress().catch(console.error);
