import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(url, key);

async function inspect() {
    console.log('--- [TRINITY 🛡️ RLS & SCHEMA AUDIT] ---');

    // 1. Check for 'title' column existence
    const { data: cols, error: colError } = await supabase.rpc('get_table_columns', { table_name: 'trinity_artifacts' });

    if (colError) {
        console.log('RPC Failed. Trying raw query on information_schema...');
        const { data: rawCols, error: rawError } = await supabase
            .from('trinity_artifacts')
            .select('*')
            .limit(0);

        console.log('Available Columns (from empty select):', rawCols ? Object.keys(rawCols) : 'None');
    } else {
        console.log('Columns:', cols);
    }

    // 2. Test RLS with a dummy insert
    console.log('Testing RLS insert...');
    const { error: insError } = await supabase.from('trinity_artifacts').insert({
        task_id: 'test-rls-' + Date.now(),
        content_preview: 'test'
    });

    if (insError) {
        console.log(`❌ RLS TEST FAILED: ${insError.message}`);
    } else {
        console.log('✅ RLS TEST SUCCEEDED (Insert allowed)');
    }
}

inspect();
