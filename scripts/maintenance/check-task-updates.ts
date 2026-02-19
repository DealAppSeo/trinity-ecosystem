import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(url, key);

async function check() {
    const fiveMinsAgo = new Date(Date.now() - 5 * 60000).toISOString();
    const { data, error } = await supabase
        .from('trinity_tasks')
        .select('*')
        .gte('updated_at', fiveMinsAgo);

    if (error) {
        console.error('Error:', error.message);
    } else {
        console.log(`Tasks updated in last 5 mins: ${data?.length || 0}`);
        data?.forEach(t => {
            console.log(`[${t.status}] ${t.title} - Claimed by: ${t.claimed_by}`);
        });
    }
}

check();
