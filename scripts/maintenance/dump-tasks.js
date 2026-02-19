
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(url, key);

async function run() {
    console.log('--- Analyzing Task Statuses ---');
    const { data, error } = await supabase
        .from('trinity_tasks')
        .select('*');

    if (error) {
        console.error('Error:', error.message);
        return;
    }

    const stats = {
        pending: 0,
        doing: 0,
        done: 0,
        verify: 0,
        pending_clarification: 0,
        other: 0
    };

    console.log(`Analyzing ${data.length} tasks...`);
    data.forEach(t => {
        stats[t.status] = (stats[t.status] || 0) + 1;

        if (['done', 'verify'].includes(t.status) && !t.artifact_url) {
            console.log(`[WARNING] Task ${t.id} (${t.status}) has no artifact_url! Title: ${t.title}`);
        }
    });

    console.log('\nTask Status Counts:');
    console.table(stats);

    console.log('\n--- Recent Tasks in Flight ---');
    const recent = data
        .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
        .slice(0, 10);

    recent.forEach(t => {
        console.log(`[${t.status}] ${t.title} (ID: ${t.id}, Assigned: ${t.assigned_to})`);
    });
}

run();
