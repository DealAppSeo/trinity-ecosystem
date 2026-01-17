require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    console.log('--- Bloat Audit ---');
    const today = new Date().toISOString().split('T')[0];

    // Count tasks created before today
    const { count: oldTasks, error: err1 } = await supabase
        .from('trinity_tasks')
        .select('*', { count: 'exact', head: true })
        .lt('created_at', today);

    console.log('Tasks created BEFORE today:', oldTasks);

    // Count tasks created TODAY
    const { count: newTasks, error: err2 } = await supabase
        .from('trinity_tasks')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today);

    console.log('Tasks created TODAY:', newTasks);
}

run();
