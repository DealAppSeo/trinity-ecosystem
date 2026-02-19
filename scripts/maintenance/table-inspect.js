require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    console.log('--- Table Inspection ---');
    const { data, error } = await supabase.from('trinity_tasks').select('id, created_at, status').order('created_at', { ascending: false }).limit(10);

    if (error) {
        console.error('Error:', error.message);
    } else {
        console.log('Latest 10 Tasks and their creation times:');
        data.forEach(t => console.log(`${t.id} | ${t.created_at} | ${t.status}`));
    }
}

run();
