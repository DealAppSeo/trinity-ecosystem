
import { supabase } from '../lib/supabase';
import { AGENT_WISDOM } from '../lib/wisdom';

async function run() {
    console.log("🛠️ Starting Swarm Repair...");

    // 1. REGISTER MISSING AGENTS
    const agentsToRegister = ['trinity-shofet', 'trinity-chesed', 'trinity-sophia', 'trinity-nexus'];
    for (const agentName of agentsToRegister) {
        console.log(`[AGENT] Checking ${agentName}...`);
        const { data: existing } = await supabase.from('trinity_agent_registry').select('id').eq('agent_name', agentName).single();
        if (!existing) {
            console.log(`[AGENT] ➕ Registering missing agent: ${agentName}`);
            const wisdom = AGENT_WISDOM[agentName];
            await supabase.from('trinity_agent_registry').insert({
                agent_name: agentName,
                status: 'idle',
                current_tier: wisdom?.tier || 'specialist',
                reputation_score: 50,
                last_active: new Date().toISOString()
            });
        } else {
            // Wake them up
            await supabase.from('trinity_agent_registry').update({ status: 'idle', last_active: new Date().toISOString() }).eq('agent_name', agentName);
        }
    }

    // 2. BACKFILL ARTIFACTS FOR "DONE" TASKS
    console.log("📦 Checking for 'Done' tasks missing artifacts...");
    const { data: doneTasks } = await supabase.from('trinity_tasks').select('*').eq('status', 'done').is('artifact_url', null);

    console.log(`Found ${doneTasks?.length || 0} tasks to repair.`);

    for (const task of doneTasks || []) {
        if (!task.result) continue;
        console.log(`[BACKFILL] 🩹 Repairing artifact for Task ${task.id}: "${task.title}"`);

        // We'll insert a record into trinity_artifacts manually to avoid logic loops
        const safeTaskId = String(task.id);
        const { data: art, error: artErr } = await supabase.from('trinity_artifacts').insert({
            task_id: safeTaskId,
            title: `Artifact: ${task.title}`,
            content: task.result,
            artifact_type: 'report',
            status: 'created',
            agent: task.completed_by || 'trinity-orch',
            creator_agent: task.completed_by || 'trinity-orch',
            created_at: new Date().toISOString(),
            storage_location: 'supabase'
        }).select('id').single();

        if (artErr) {
            console.error(`[BACKFILL] ❌ Failed to create artifact for task ${task.id}: ${artErr.message}`);
        } else {
            // Update task with the new link
            const artUrl = `db://trinity_artifacts/${art.id}`;
            await supabase.from('trinity_tasks').update({ artifact_url: artUrl }).eq('id', task.id);
            console.log(`[BACKFILL] ✅ Task ${task.id} linked to Artifact ${art.id}`);
        }
    }

    console.log("✨ Swarm Repair Complete.");
}

run();
