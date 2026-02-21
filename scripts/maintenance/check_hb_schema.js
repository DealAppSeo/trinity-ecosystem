
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

async function checkHeartbeatSchema() {
    console.log('--- SCHEMA CHECK: trinity_heartbeat ---');
    const { data, error } = await supabase.from('trinity_heartbeat').select('*').limit(1);

    if (error) {
        console.error('Error:', error);
        return;
    }

    if (data && data.length > 0) {
        const row = data[0];
        console.log('Sample Row Keys:');
        for (const key in row) {
            console.log(`${key}: ${typeof row[key]}`);
        }
    } else {
        console.log('No data found in trinity_heartbeat. Checking if table exists via empty select...');
        const { error: emptyErr } = await supabase.from('trinity_heartbeat').select('count', { count: 'exact', head: true });
        if (emptyErr) console.error('Table check error:', emptyErr);
        else console.log('Table exists but is empty.');
    }
}

checkHeartbeatSchema();
