
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: './.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase env vars.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSpecialistLogs() {
    const agents = ['trinity-chesed', 'trinity-nexus', 'trinity-sophia'];

    console.log("Checking logs for specialists...");

    for (const agent of agents) {
        const { data: logs, error } = await supabase
            .from('trinity_agent_logs')
            .select('*')
            .eq('agent_name', agent)
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) {
            console.error(`Error fetching logs for ${agent}:`, error);
            continue;
        }

        console.log(`\n==========================================`);
        console.log(`AGENT: ${agent}`);
        console.log(`==========================================`);

        console.log(`\n--- RECENT LOGS ---`);
        if (!logs || logs.length === 0) {
            console.log("No logs found.");
        } else {
            logs.forEach(log => {
                console.log(`[${log.created_at}] ${log.event_type || 'NONE'}: ${log.message}`);
                if (log.payload) console.log(`  Payload: ${JSON.stringify(log.payload).substring(0, 100)}...`);
            });
        }

        const { data: registry } = await supabase
            .from('trinity_agent_registry')
            .select('*')
            .eq('agent_name', agent)
            .single();

        console.log(`\n--- REGISTRY DATA ---`);
        if (registry) {
            console.log(`Status: ${registry.status}`);
            console.log(`Last Active: ${registry.last_active}`);
            console.log(`Tasks Completed: ${registry.tasks_completed}`);
            console.log(`Current Task: ${registry.current_task_summary}`);
            console.log(`Reputation: ${registry.reputation_score}`);
        } else {
            console.log("Registry entry not found.");
        }
    }
}

checkSpecialistLogs();
