
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

async function checkIntegrity() {
    console.log('--- PEER VERIFICATION STATUS ---');
    const { data: doneTasks } = await supabase
        .from('trinity_tasks')
        .select('id, title, status, verify_count, verified_by, claimed_by')
        .eq('status', 'done')
        .limit(10);

    if (doneTasks && doneTasks.length > 0) {
        doneTasks.forEach(t => {
            console.log(`Task #${t.id}: ${t.title} | VerifyCount: ${t.verify_count || 0}/2 | VerifiedBy: ${JSON.stringify(t.verified_by || [])}`);
        });
    } else {
        console.log('No tasks currently in "Done" (Awaiting Verification).');
    }

    console.log('\n--- RECENT AGENT ERRORS ---');
    const { data: errors } = await supabase
        .from('trinity_agent_logs')
        .select('*')
        .eq('type', 'task_failure')
        .order('created_at', { ascending: false })
        .limit(10);

    if (errors && errors.length > 0) {
        errors.forEach(e => {
            console.log(`[${e.created_at}] ${e.agent_name}: ${e.message}`);
        });
    } else {
        console.log('No recent task failures logged.');
    }

    console.log('\n--- HEARTBEAT RECENTNESS ---');
    const { data: heartbeats } = await supabase
        .from('trinity_heartbeat')
        .select('agent_name, created_at, status_message')
        .order('created_at', { ascending: false })
        .limit(12);

    if (heartbeats) {
        heartbeats.forEach(h => {
            console.log(`[${h.created_at}] ${h.agent_name}: ${h.status_message}`);
        });
    }
}

checkIntegrity();
