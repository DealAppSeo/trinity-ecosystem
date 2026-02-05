import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { supabase } from '../lib/supabase';

async function findTestTasks() {
    console.log("🔍 Checking status of seeded tasks (118130-118132)...");

    // Dynamic import
    const { supabase } = await import('../lib/supabase');

    const { data: tasks, error } = await supabase
        .from('trinity_tasks')
        .select('*')
        .in('id', [118130, 118131, 118132]);

    if (error) {
        console.error("❌ Error fetching tasks:", error.message);
    } else if (tasks) {
        tasks.forEach(t => {
            console.log(`[${t.status.toUpperCase()}] ${t.title} (Claimed by: ${t.claimed_by || 'None'})`);
        });
    }

    console.log("\n🔍 Checking for new artifacts...");
    const { data: artifacts, error: artifactsError } = await supabase
        .from('trinity_artifacts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    if (artifactsError) {
        console.error("❌ Error fetching artifacts:", artifactsError.message);
    } else if (artifacts) {
        artifacts.forEach(a => {
            console.log(`- [${a.artifact_type}] ${a.title} by ${a.creator_agent}`);
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
