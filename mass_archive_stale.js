
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
const supabaseKey = env['SUPABASE_SERVICE_ROLE_KEY']; // Use service role for mass update

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function massArchive() {
    console.log('--- MASS ARCHIVING STALE PENDING TASKS ---');

    // We target 'pending' tasks that are not claimed
    const { count, error } = await supabase
        .from('trinity_tasks')
        .update({ status: 'archived' })
        .eq('status', 'pending')
        .is('claimed_by', null);

    if (error) {
        console.error('Mass archive FAILED:', error.message);
    } else {
        console.log(`Successfully archived stale pending tasks.`);
    }
}

massArchive();
