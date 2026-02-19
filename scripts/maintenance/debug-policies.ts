
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function inspectPolicies() {
    console.log('🔍 Inspecting RLS Policies for Trinity Tables...');

    const tables = ['trinity_agent_registry', 'trinity_tasks', 'trinity_agent_logs', 'trinity_heartbeat', 'trinity_artifacts'];

    for (const table of tables) {
        console.log(`\n--- Table: ${table} ---`);
        const { data: policies, error } = await supabase.rpc('inspect_table_policies', { table_name: table });

        if (error) {
            // Fallback: try raw SQL via RPC if inspect_table_policies doesn't exist
            const { data: rawPolicies, error: rawError } = await supabase
                .from('pg_policies')
                .select('*')
                .eq('tablename', table);

            if (rawError) {
                console.error(`❌ Error fetching policies for ${table}:`, rawError.message);
                // Last ditch effort: simple select to see if we can even read it
                const { count, error: countError } = await supabase.from(table).select('*', { count: 'exact', head: true });
                if (countError) console.error(`❌ Cannot even read ${table}:`, countError.message);
                else console.log(`✅ Table ${table} is readable by Service Role (Count: ${count})`);
            } else {
                console.table(rawPolicies);
            }
        } else {
            console.table(policies);
        }
    }
}

inspectPolicies();
