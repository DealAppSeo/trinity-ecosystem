
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(url, key);

async function run() {
    console.log('--- Searching for "docs" in any column ---');
    const { data, error } = await supabase
        .from('trinity_tasks')
        .select('*');

    if (error) {
        console.error('Error:', error.message);
        return;
    }

    console.log(`Checking ${data.length} tasks...`);
    data.forEach(t => {
        const matches = Object.entries(t).filter(([k, v]) =>
            v && typeof v === 'string' && v.toLowerCase().includes('docs')
        );
        if (matches.length > 0) {
            console.log(`\nTask ID: ${t.id} (Status: ${t.status})`);
            matches.forEach(([k, v]) => console.log(`  - Found in [${k}]: "${v}"`));
            console.log(`  - artifact_url: ${t.artifact_url}`);
        }
    });
}

run();
