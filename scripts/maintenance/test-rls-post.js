require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
    console.log('--- Post-SQL RLS Test ---');
    const { data, error } = await supabase.from('trinity_artifacts').insert({
        task_id: 999999,
        title: 'Post-SQL Confirmation',
        content: 'Trinity is officially unblocked.',
        agent: 'trinity-shofet',
        artifact_type: 'text',
        status: 'created'
    }).select();

    if (error) {
        console.error('❌ RLS STILL ACTIVE or Schema Mismatch:', error.message);
    } else {
        console.log('✅ SUCCESS! RLS is OFF. Data:', data);
    }
}

test();
