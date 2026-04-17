
import { supabase } from '../lib/supabase';

async function run() {
    console.log("Checking trinity_artifacts columns...");
    const { data: cols, error } = await supabase.from('trinity_artifacts').select('*').limit(1);
    if (error) {
        console.error("Error fetching columns:", error.message);
    } else {
        console.log("Columns:", Object.keys(cols[0] || {}));
    }

    console.log("\nChecking trinity_tasks 'done' status...");
    const { data: doneTasks } = await supabase.from('trinity_tasks').select('id, title, artifact_url, result').eq('status', 'done');
    console.log(`Found ${doneTasks?.length || 0} 'done' tasks.`);
    doneTasks?.forEach(t => {
        if (!t.artifact_url) {
            console.log(`- Task ${t.id} ("${t.title}") has NO artifact_url. Preview: ${t.result?.substring(0, 50)}...`);
        }
    });

    console.log("\nChecking trinity_agent_registry for 'online' status...");
    const { data: agents } = await supabase.from('trinity_agent_registry').select('agent_name, status, last_active');
    console.table(agents);
}
run();
