const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function fetchCompletedTasks() {
    console.log("Fetching completed tasks from the last 3 hours...");
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    
    // Status can be 'done', 'completed', or 'verified' based on previous context
    const { data: tasks, error } = await supabase
        .from('trinity_tasks')
        .select('*')
        .in('status', ['done', 'completed', 'verified'])
        .gt('updated_at', threeHoursAgo);
        
    if (error) {
        console.error("Error fetching tasks:", error);
        return;
    }
    
    console.log(`Found ${tasks.length} completed tasks.`);
    
    const resultsDir = path.join(__dirname, '..', 'sprint_results');
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir);
    
    for (const t of tasks) {
        if (!t.result) continue;
        const filename = `${t.agent_name}_task_${t.id}.md`;
        const filepath = path.join(resultsDir, filename);
        
        const content = `# ${t.title}\n\n**Agent:** ${t.agent_name}\n**Status:** ${t.status}\n**Completed At:** ${t.updated_at}\n\n## Description\n${t.description}\n\n## Result\n${t.result}`;
        fs.writeFileSync(filepath, content);
        console.log(`Saved result for task ${t.id} from ${t.agent_name} to sprint_results/${filename}`);
    }
}

fetchCompletedTasks();
