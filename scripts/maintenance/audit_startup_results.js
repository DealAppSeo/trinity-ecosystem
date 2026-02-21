
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

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'] || 'https://qnnpjhlxljtqyigedwkb.supabase.co';
const supabaseKey = env['SUPABASE_SERVICE_ROLE_KEY'] || env['SUPABASE_SERVICE_KEY'] || env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkFailures() {
    console.log('--- STARTUP WEEKEND / MORNING DEADLINE AUDIT ---');

    const { data: tasks, error } = await supabase
        .from('trinity_tasks')
        .select('id, title, status, result, claimed_by, updated_at')
        .or('status.eq.failed,status.eq.done')
        .like('title', '%[MORNING DEADLINE]%');

    if (error) {
        console.error('Error fetching tasks:', error.message);
    } else {
        tasks.forEach(t => {
            console.log(`\nID: ${t.id}`);
            console.log(`Title: ${t.title}`);
            console.log(`Status: ${t.status}`);
            console.log(`Agent: ${t.claimed_by}`);
            console.log(`Result: ${t.result ? t.result.substring(0, 500) : 'NO RESULT'}`);
            console.log('---');
        });
    }

    const { data: art, error: artError } = await supabase
        .from('trinity_artifacts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    if (artError) {
        console.error('Error fetching artifacts:', artError.message);
    } else {
        console.log('\n--- MOST RECENT ARTIFACTS ---');
        art.forEach(a => {
            console.log(`[${a.created_at}] [${a.agent}] ${a.title}`);
        });
    }
}

checkFailures();
