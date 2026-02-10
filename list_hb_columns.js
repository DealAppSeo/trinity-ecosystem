
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

async function listColumns() {
    console.log('--- COLUMN LIST: trinity_heartbeat ---');
    // We can't use information_schema via anon key easily, but we can try to insert a garbage object
    // and see the error message which often suggests valid columns in PostgREST.
    // Or just try common ones.
    const { error } = await supabase.from('trinity_heartbeat').insert({ unknown_column_test: 1 });
    if (error) {
        console.log('Error output (check for valid columns):', error.message);
    }
}

listColumns();
