
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

async function checkDistribution() {
    console.log('--- MISSION STATUS DISTRIBUTION ---');
    const { data, error } = await supabase
        .from('trinity_tasks')
        .select('status');

    if (error) {
        console.error('Error fetching tasks:', error);
        return;
    }

    const counts = data.reduce((acc, t) => {
        acc[t.status] = (acc[t.status] || 0) + 1;
        return acc;
    }, {});

    console.log(JSON.stringify(counts, null, 2));

    console.log('\n--- RECENT VERIFIED MISSIONS ---');
    const { data: verified } = await supabase
        .from('trinity_tasks')
        .select('id, title, status, verified_by, verify_count')
        .eq('status', 'verified')
        .order('updated_at', { ascending: false })
        .limit(5);

    console.log(JSON.stringify(verified, null, 2));
}

checkDistribution();
