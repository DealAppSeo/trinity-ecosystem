import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(url, key);

async function check() {
    const { count, error } = await supabase.from('trinity_artifacts').select('*', { count: 'exact', head: true });
    console.log(`Total Artifacts: ${count}`);

    // Check for our specific ID 241 or just latest
    const { data: all_latest } = await supabase.from('trinity_artifacts').select('*').order('created_at', { ascending: false }).limit(10);
    console.log('Latest 10 Artifacts Body Keys:', all_latest?.map(a => Object.keys(a)));
}

check();
