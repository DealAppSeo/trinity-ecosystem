
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

async function checkSchema() {
    console.log('--- SCHEMA CHECK: trinity_tasks ---');
    // We can't easily get full schema via anon key sometimes, but we can check a sample row's types
    const { data, error } = await supabase.from('trinity_tasks').select('*').limit(1);

    if (error) {
        console.error('Error:', error);
        return;
    }

    if (data && data.length > 0) {
        const row = data[0];
        console.log('Sample Row Keys & Types:');
        for (const key in row) {
            console.log(`${key}: ${typeof row[key]} (Actual value: ${JSON.stringify(row[key])})`);
        }
    } else {
        console.log('No data found in trinity_tasks.');
    }
}

checkSchema();
