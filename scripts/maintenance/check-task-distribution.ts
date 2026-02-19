import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(url, key);

async function check() {
    console.log('--- [TRINITY TASK DISTRIBUTION] ---');
    const { data, error } = await supabase.rpc('get_task_status_distribution'); // This might not exist, trying fallback

    if (error) {
        // Fallback: Individual counts
        const statuses = ['pending', 'in_progress', 'completed', 'failed'];
        for (const s of statuses) {
            const { count } = await supabase.from('trinity_tasks').select('*', { count: 'exact', head: true }).eq('status', s);
            console.log(`${s}: ${count}`);
        }
    } else {
        console.log(data);
    }
}

check();
