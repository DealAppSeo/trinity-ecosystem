
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

async function restoreTasks() {
    console.log('--- RESTORING MISSIONS ---');

    // Find recent archived tasks that aren't 'Verified'
    const { data: archived } = await supabase
        .from('trinity_tasks')
        .select('*')
        .eq('status', 'archived')
        .order('created_at', { ascending: false })
        .limit(50);

    if (archived && archived.length > 0) {
        console.log(`Found ${archived.length} archived tasks. Restoring...`);

        for (const task of archived) {
            // Restore to 'pending'
            await supabase.from('trinity_tasks').update({
                status: 'pending',
                claimed_by: null
            }).eq('id', task.id);
        }
        console.log('Restoration complete.');
    } else {
        console.log('No tasks to restore.');
    }
}

restoreTasks();
