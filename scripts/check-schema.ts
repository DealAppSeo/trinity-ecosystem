import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(url, key);

async function check() {
    const { data, error } = await supabase.rpc('get_table_columns', { table_name: 'trinity_artifacts' });

    // Fallback if rpc doesn't exist: use a sample insert or select
    const { data: sample, error: err2 } = await supabase.from('trinity_artifacts').select('*').limit(1);

    if (sample && sample.length > 0) {
        console.log('Columns in trinity_artifacts:', Object.keys(sample[0]));
    } else {
        console.log('Could not determine columns from sample.');
        if (err2) console.error('Sample Select Error:', err2.message);
    }
}

check();
