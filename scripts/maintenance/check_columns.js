
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

async function checkColumns() {
    console.log('--- TARGETED COLUMN CHECK ---');
    const { data: vBy, error: vByErr } = await supabase.from('trinity_tasks').select('verified_by').limit(1);
    console.log('verified_by query:', vByErr ? 'FAILED: ' + vByErr.message : 'SUCCESS');

    const { data: sigs, error: sigsErr } = await supabase.from('trinity_tasks').select('signatures').limit(1);
    console.log('signatures query:', sigsErr ? 'FAILED: ' + sigsErr.message : 'SUCCESS');
}

checkColumns();
