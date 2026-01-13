
import { supabase } from '../lib/supabase';

async function assignToAPM() {
    console.log("🔄 Re-assigning 'Create Greeting File' to 'trinity-apm'...");

    // Find the specific task
    const { data: tasks } = await supabase
        .from('trinity_tasks')
        .select('*')
        .ilike('title', '%Greeting File%')
        .limit(1);

    if (!tasks || tasks.length === 0) {
        console.log("❌ Task not found.");
        return;
    }

    const task = tasks[0];
    console.log(`Found Task: ${task.title} (Currently: ${task.agent_assigned || 'Unassigned'})`);

    // Update assignment
    const { error } = await supabase
        .from('trinity_tasks')
        .update({
            agent_assigned: 'trinity-apm',
            status: 'pending' // Ensure it's pending so APM picks it up
        })
        .eq('id', task.id);

    if (error) console.error("❌ Failed to update:", error.message);
    else console.log(`✅ Assigned to 'trinity-apm'. Watch the logs!`);
}

assignToAPM();
