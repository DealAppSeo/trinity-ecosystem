require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    console.log('--- ADMINISTRATIVE RESET ---');
    console.log('Deleting all tasks via Service Role...');

    const { count: before } = await supabase.from('trinity_tasks').select('*', { count: 'exact', head: true });
    console.log('Count before:', before);

    // Delete everything
    const { error } = await supabase.from('trinity_tasks').delete().neq('id', -1); // Delete all where id != -1

    if (error) {
        console.error('❌ Delete Failed:', error.message);
    } else {
        console.log('✅ Delete command sent.');
    }

    const { count: after } = await supabase.from('trinity_tasks').select('*', { count: 'exact', head: true });
    console.log('Count after:', after);
}

run();
