
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
    console.log('--- FINAL SYSTEM INTEGRITY AUDIT ---');

    // 1. Check Heartbeats (Confirming fix)
    const { data: hbs } = await supabase.from('trinity_heartbeat').select('*').limit(5);
    console.log(`Heartbeat Records: ${hbs ? hbs.length : 0}`);
    if (hbs && hbs.length > 0) {
        hbs.forEach(h => console.log(`- ${h.agent}: ${h.status} (Last seen: ${h.last_seen})`));
    }

    // 2. Check Verification Progress
    const { data: verifiedTasks } = await supabase.from('trinity_tasks').select('id, title, verify_count').eq('status', 'verified').limit(5);
    console.log(`Verified Tasks (Recently): ${verifiedTasks ? verifiedTasks.length : 0}`);

    // 3. Check Pending Verification (Done tasks)
    const { data: doneTasks } = await supabase.from('trinity_tasks').select('id, title, verify_count').eq('status', 'done').limit(5);
    console.log(`Tasks awaiting verification: ${doneTasks ? doneTasks.length : 0}`);
}

checkIntegrity();
