
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(url, key);

async function inspectTriggers() {
    console.log('\n--- Triggers on trinity_tasks ---');
    const { data: triggers, error: trigError } = await supabase.rpc('inspect_triggers', { t_name: 'trinity_tasks' });
    if (triggers) {
        console.table(triggers);
    } else {
        console.log('Error or no triggers found:', trigError?.message);
    }
}

async function inspectFunction() {
    console.log('\n--- Function: enforce_artifact_requirement ---');
    // We can't easily get function source via standard JS client without a custom RPC or direct query
    // Let's try to query information_schema.routines
    const { data, error } = await supabase.from('pg_proc').select('prosrc').ilike('proname', 'enforce_artifact_requirement');
    if (data && data.length > 0) {
        console.log(data[0].prosrc);
    } else {
        // Try another way: use pg_get_functiondef
        const { data: def, error: defError } = await supabase.rpc('get_function_definition', { f_name: 'enforce_artifact_requirement' });
        if (def) {
            console.log(def);
        } else {
            console.log('Could not find function definition:', error?.message || defError?.message);
        }
    }
}

async function checkDocsTasks() {
    console.log('\n--- Docs Tasks without Artifact URL ---');
    const { data, error } = await supabase
        .from('trinity_tasks')
        .select('*')
        .eq('type', 'docs');

    if (data) {
        data.forEach(t => {
            console.log(`ID: ${t.id}, status: ${t.status}, assigned_to: ${t.assigned_to}, artifact_url: ${t.artifact_url}`);
        });
    }
}

async function run() {
    await inspectTriggers();
    await inspectFunction();
    await checkDocsTasks();
}

run();
