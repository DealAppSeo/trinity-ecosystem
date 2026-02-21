
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

async function testFetch() {
    console.log('--- TESTING PEER REVIEW FETCH ---');
    const agentName = 'trinity-veritas'; // Example

    // Testing the patched query logic
    const { data: tasks, error } = await supabase
        .from('trinity_tasks')
        .select('id, title, status, verified_by, verify_count')
        .in('status', ['done', 'completed'])
        .neq('claimed_by', agentName)
        .lt('verify_count', 3)
        .or(`verified_by.is.null,verified_by.not.cs.{"${agentName}"}`)
        .limit(5);

    if (error) {
        console.error('Fetch FAILED:', error.message);
    } else {
        console.log(`Found ${tasks ? tasks.length : 0} tasks for review.`);
        if (tasks) {
            tasks.forEach(t => console.log(`- Task #${t.id}: ${t.title}`));
        }
    }
}

testFetch();
