import { supabaseAdmin as supabase } from '../lib/supabase';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function debug() {
    console.log('--- DB DEBUG ---');
    console.log('URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);

    const { data: tables, error: tableErr } = await supabase.rpc('exec_sql', {
        query: "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
    });

    if (tableErr) {
        console.error('Table Error:', tableErr.message);
    } else {
        console.log('Tables:', tables?.map((t: any) => t.tablename));
    }

    const { count, error: countErr } = await supabase
        .from('trinity_tasks')
        .select('*', { count: 'exact', head: true });

    if (countErr) {
        console.error('Count Error:', countErr.message);
    } else {
        console.log('Trinity Tasks Count:', count);
    }
}

debug();
