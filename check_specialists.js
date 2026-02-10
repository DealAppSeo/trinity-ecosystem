
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSpecialists() {
    console.log('--- AUDITING SPECIALIST AGENTS ---');
    const specialists = ['trinity-chesed', 'trinity-nexus', 'trinity-sophia'];

    // 1. Check Registry
    const { data: registry, error: regError } = await supabase
        .from('trinity_agent_registry')
        .select('*')
        .in('agent_name', specialists);

    if (regError) console.error('Registry Error:', regError);
    else {
        console.log('\n[REGISTRY STATUS]');
        registry.forEach(a => {
            console.log(`${a.agent_name}: Status=${a.status}, TasksDone=${a.tasks_completed}, Rep=${a.reputation_score}`);
        });
    }

    // 2. Check Recent Heartbeats
    const { data: heartbeats, error: hbError } = await supabase
        .from('trinity_heartbeat')
        .select('*')
        .in('agent', specialists)
        .order('id', { ascending: false })
        .limit(3);

    if (hbError) console.error('Heartbeat Error:', hbError);
    else {
        console.log('\n[LATEST HEARTBEATS]');
        heartbeats.forEach(h => {
            console.log(`${h.agent}: Msg="${h.status}", Updated=${h.last_seen}`);
        });
    }

    // 3. Check Pending Tasks for them
    const { data: tasks, error: taskError } = await supabase
        .from('trinity_tasks')
        .select('*')
        .in('assigned_to', specialists)
        .eq('status', 'pending');

    if (taskError) console.error('Task Error:', taskError);
    else {
        console.log(`\n[PENDING TASKS]: ${tasks.length}`);
        tasks.forEach(t => {
            console.log(`- ${t.title} (Assigned to: ${t.assigned_to})`);
        });
    }

    // 4. Check Verification Tasks
    const { count: verifyCount, error: vError } = await supabase
        .from('trinity_tasks')
        .select('*', { count: 'exact', head: true })
        .ilike('title', '%[VERIFY]%')
        .eq('status', 'pending');

    console.log(`\n[PENDING VERIFICATIONS]: ${verifyCount}`);
}

checkSpecialists();
