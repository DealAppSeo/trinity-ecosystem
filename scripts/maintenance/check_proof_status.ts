
import { supabase } from '../lib/supabase';

async function checkProofStatus() {
    console.log("🔍 Checking Proof-of-Work Status...\n");

    // 1. Check Tasks (Get recent 50)
    const { data: tasks, error: taskError } = await supabase
        .from('trinity_tasks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

    if (taskError) {
        console.error("❌ Error fetching tasks:", taskError.message);
    } else {
        // Filter in memory for 'TestScript' if possible, or just look for [TEST:] in title
        const testTasks = tasks.filter(t => t.title && t.title.startsWith('[TEST:'));

        const pending = testTasks.filter(t => t.status === 'pending').length;
        const inProgress = testTasks.filter(t => t.status === 'in_progress').length;
        const done = testTasks.filter(t => t.status === 'done' || t.status === 'max_turn_limit').length;

        console.log(`📊 TASKS (Total: ${tasks.length})`);
        console.log(`   - ⏳ Pending: ${pending}`);
        console.log(`   - 🔄 In Progress: ${inProgress}`);
        console.log(`   - ✅ Done: ${done}`);

        console.log("\n   Recent Updates:");
        tasks.filter(t => t.status !== 'pending').forEach(t => {
            console.log(`   • [${t.status.toUpperCase()}] ${t.title} (Agent: ${t.assigned_agent || t.claimed_by || 'Unknown'})`);
        });
    }

    // 2. Check Artifacts (Created recently)
    // We look for files in 'artifacts/proofs' or created by our known agents
    const { data: artifacts, error: artError } = await supabase
        .from('trinity_artifacts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

    if (artError) {
        console.error("\n❌ Error fetching artifacts:", artError.message);
    } else {
        console.log(`\n📂 LATEST ARTIFACTS (Last 10):`);
        if (artifacts.length === 0) console.log("   (No artifacts found yet)");

        artifacts.forEach(a => {
            console.log(`   • 📄 ${a.file_path} (by ${a.agent_name})`);
        });
    }
}

checkProofStatus();
