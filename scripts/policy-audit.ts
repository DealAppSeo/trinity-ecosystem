import { supabase } from '../lib/supabase';

async function auditPolicies() {
    console.log('--- AUDITING POLICIES ---');
    const tables = ['trinity_agent_registry', 'trinity_tasks', 'trinity_artifacts'];

    for (const table of tables) {
        console.log(`Checking ${table}...`);
        const { data, error } = await supabase.rpc('exec_sql', {
            query: `SELECT policyname, roles, cmd, qual, with_check FROM pg_policies WHERE tablename = '${table}'`
        });

        if (error) {
            console.error(`Error checking ${table}:`, error.message);
            continue;
        }

        console.log(JSON.stringify(data, null, 2));
    }
}

auditPolicies();
