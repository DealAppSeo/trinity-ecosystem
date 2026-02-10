
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env.local');
let env = {};
if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) env[key.trim()] = value.trim();
    });
}

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseKey = env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function finalAudit() {
    console.log('--- AGENT WORKLOAD AUDIT ---');
    const { data: agents } = await supabase.from('trinity_agents').select('*');
    if (agents) {
        agents.forEach(a => {
            if (a.status === 'working' || a.status === 'active' || a.current_task_summary) {
                console.log(`Agent: ${a.agent_name} | Status: ${a.status} | Task Summary: ${a.current_task_summary}`);
            }
        });
    }

    console.log('\n--- TARGETED MISSION CHECK (122994, 122998) ---');
    const { data: targetTasks } = await supabase.from('trinity_tasks')
        .select('*')
        .in('id', [122994, 122998, '122994', '122998']);

    if (targetTasks) {
        targetTasks.forEach(t => {
            console.log(`Task #${t.id}: ${t.title} | Status: ${t.status} | Claimed By: ${t.claimed_by} | Result: ${t.result?.substring(0, 100)}`);
        });
    }
}

finalAudit();
