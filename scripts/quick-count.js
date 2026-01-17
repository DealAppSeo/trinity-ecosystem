require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    console.log('--- Quick Count (JS) ---');
    const { count, error } = await supabase.from('trinity_tasks').select('*', { count: 'exact', head: true });
    console.log('Task Count:', count);
    if (error) console.error('Error:', error.message);
}

run();
