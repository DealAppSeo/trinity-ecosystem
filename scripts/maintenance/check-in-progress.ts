import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(url, key);

async function check() {
    const { data: tasks, error } = await supabase
        .from('trinity_tasks')
        .select('*')
        .eq('status', 'in_progress');

    if (error) {
        console.error('Error fetching tasks:', error.message);
    } else {
        console.log(`--- IN PROGRESS TASKS (${tasks?.length || 0}) ---`);
        tasks?.forEach(t => {
            console.log(`[${t.claimed_by}] ${t.title}`);
        });
    }
}

check();
