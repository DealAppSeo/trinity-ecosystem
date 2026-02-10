
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

async function syncTelemetry() {
    console.log('--- SYNCING TELEMETRY ---');

    // 1. Get all agents
    const { data: agents } = await supabase.from('trinity_agent_registry').select('*');
    if (!agents) return;

    for (const agent of agents) {
        // 2. Count tasks where completed_by matches agent name
        const { count, error } = await supabase
            .from('trinity_tasks')
            .select('*', { count: 'exact', head: true })
            .or(`completed_by.eq.${agent.agent_name},claimed_by.eq.${agent.agent_name}`)
            .in('status', ['done', 'verified', 'archived']);

        if (error) {
            console.error(`Error counting for ${agent.agent_name}:`, error);
            continue;
        }

        console.log(`Agent ${agent.agent_name}: DB Count = ${count}, Current Registry = ${agent.tasks_completed}`);

        // 3. Update registry if mismatch (or just force update)
        if (count > agent.tasks_completed) {
            await supabase.from('trinity_agent_registry').update({
                tasks_completed: count
            }).eq('agent_name', agent.agent_name);
            console.log(`Updated ${agent.agent_name} to ${count} tasks.`);
        }
    }
    console.log('Sync complete.');
}

syncTelemetry();
