
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function diagnose() {
    console.log('--- 🔍 Diagnosing Table Accessibility (ANON Key) ---');
    console.log('URL:', supabaseUrl);

    const tables = [
        'trinity_agent_registry',
        'trinity_tasks',
        'trinity_agent_logs',
        'trinity_heartbeat'
    ];

    for (const table of tables) {
        console.log(`\nTesting table: ${table}...`);
        const { data, error, count } = await supabase
            .from(table)
            .select('*', { count: 'exact', head: true })
            .limit(1);

        if (error) {
            console.error(`❌ ${table}: Error -`, error.message, `(${error.code})`);
        } else {
            console.log(`✅ ${table}: Success - Count: ${count}`);
        }
    }

    console.log('\n--- 🧠 Testing useTrinityController Promise.all logic ---');
    try {
        const results = await Promise.all([
            supabase.from('trinity_agent_registry').select('*').limit(1),
            supabase.from('trinity_tasks').select('*').limit(1),
            supabase.from('trinity_agent_logs').select('*').limit(1),
            supabase.from('trinity_heartbeat').select('*').limit(1)
        ]);
        console.log('✅ Promise.all resolved successfully.');
        results.forEach((r, i) => {
            if (r.error) console.log(`Result ${i} (${tables[i]}) had error:`, r.error.message);
            else console.log(`Result ${i} (${tables[i]}) data length:`, r.data?.length);
        });
    } catch (e: any) {
        console.error('❌ Promise.all threw an error:', e.message);
    }
}

diagnose();
