require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    console.log('--- Operation Clean Slate ---');

    // We will delete in chunks of 5000 until the pre-today count is 0.
    const today = new Date().toISOString().split('T')[0];

    let done = false;
    while (!done) {
        console.log('Clearing batch of 5000 ancient tasks...');
        const { data: ids, error: fErr } = await supabase
            .from('trinity_tasks')
            .select('id')
            .lt('created_at', today)
            .limit(5000);

        if (fErr || !ids || ids.length === 0) {
            done = true;
            break;
        }

        const { error: dErr } = await supabase
            .from('trinity_tasks')
            .delete()
            .in('id', ids.map(t => t.id));

        if (dErr) {
            console.error('❌ Batch Failed:', dErr.message);
            break;
        }
        console.log(`✅ Deleted ${ids.length} tasks.`);
    }
    console.log('--- Clean Slate Finished ---');
}

run();
