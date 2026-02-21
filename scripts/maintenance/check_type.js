
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

async function checkType() {
    console.log('--- DATA TYPE CHECK ---');
    // We can use a raw SQL query via RPC or just observe the result of a select
    const { data, error } = await supabase.from('trinity_tasks').select('verified_by').not('verified_by', 'is', null).limit(1);

    if (error) {
        console.error('Error selecting verified_by:', error);
        return;
    }

    if (data && data.length > 0) {
        const value = data[0].verified_by;
        console.log(`Value: ${JSON.stringify(value)}`);
        console.log(`Type: ${typeof value}`);
        console.log(`Is Array: ${Array.isArray(value)}`);
    } else {
        console.log('No non-null verified_by found.');
    }
}

checkType();
