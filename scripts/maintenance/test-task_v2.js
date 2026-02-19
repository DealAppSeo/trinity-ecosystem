
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
    console.error('❌ Missing credentials!');
    console.log('URL:', url);
    console.log('KEY:', key ? 'FOUND' : 'MISSING');
    process.exit(1);
}

const supabase = createClient(url, key);

async function insertTestTask() {
    console.log('Inserting test task for MEL...');
    const { data, error } = await supabase.from('trinity_tasks').insert({
        title: '[SYSTEM] Artifact Capability Test',
        description: 'Create a test artifact to verify write permissions. Please generate a short poem about resilience.',
        task_type: 'content',
        priority: 10,
        assigned_to: 'MEL',
        status: 'pending'
    }).select();

    if (error) console.error('Error:', error);
    else console.log('✅ Task inserted:', data[0].id);
}

insertTestTask();
