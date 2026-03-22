const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Starting script...");
    // 1. Log System Prompt Discovery
    const exactPrompt = "You are ${this.name}. ${CONSTITUTION.ARTICLE_MINUS_1.text}\\n\\nCONTEXT:\\n${bible}";
    await supabase.from('sprint_reports').insert({
        sprint_name: 'autonomous_session_march20',
        report_data: {
            action: 'Discovered Constitutional System Prompt Override',
            exact_prompt: exactPrompt,
            result: 'Prompt was rigidly hardcoded in callSpecificProvider, overwriting options.system parameter. Replaced accuracy prompt with adversarial error matching.',
            timestamp: new Date().toISOString()
        }
    });
    console.log("Logged Priority 1 discovery to sprint_reports");

    // 2. Query Evergreen tasks (seeded last night)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: evergreenTasks, error } = await supabase
        .from('trinity_tasks')
        .select('id, title, status')
        .in('task_type', ['content', 'research', 'genesis'])
        .gte('created_at', yesterday)
        .order('created_at', { ascending: false })
        .limit(20);

    let doneCount = 0;
    let pendingCount = 0;
    const taskLogs = [];
    
    if (error) {
        console.error("Error querying tasks:", error);
    } else if (evergreenTasks) {
        for (const t of evergreenTasks) {
            if (t.status === 'done' || t.status === 'verified' || t.status === 'completed') {
                doneCount++;
            } else {
                pendingCount++;
            }
            taskLogs.push(`ID: ${t.id} - ${t.title.substring(0,40)} - Status: ${t.status}`);
        }
    }

    // Log Priority 2
    await supabase.from('sprint_reports').insert({
        sprint_name: 'autonomous_session_march20',
        report_data: {
            action: 'Evergreen Tasks Status Report',
            result: `Found ${evergreenTasks?.length || 0} tasks. Done/Verified: ${doneCount}, Pending/Todo: ${pendingCount}`,
            task_details: taskLogs,
            timestamp: new Date().toISOString()
        }
    });
    console.log(`Logged Priority 2 to sprint_reports. Done/Verified: ${doneCount}, Pending: ${pendingCount}`);

    // Log the Build action intent
    await supabase.from('sprint_reports').insert({
        sprint_name: 'autonomous_session_march20',
        report_data: {
            action: 'Adversarial Prompt Swap & Build',
            result: 'Verification flow updated to use error_found payload inversion. Triggering static compilation.',
            timestamp: new Date().toISOString()
        }
    });
    console.log("Finished script.");
}
run().catch(console.error);
