
import { supabase } from '../lib/supabase';

async function run() {
    const { data: tasks } = await supabase.from('trinity_tasks').select('id, title, status, artifact_url, completed_by, result').eq('status', 'done');
    const { data: agents } = await supabase.from('trinity_agent_registry').select('agent_name, status, last_active, current_task_summary');
    const { data: clarify } = await supabase.from('trinity_tasks').select('id, title, result').eq('status', 'pending_clarification');
    const { data: artifacts } = await supabase.from('trinity_artifacts').select('id, task_id, title, creator_agent');

    const fs = require('fs');
    fs.writeFileSync('full_report.json', JSON.stringify({ tasks, agents, clarify, artifacts }, null, 2), 'utf8');
    console.log("Report written to full_report.json");
}
run();
