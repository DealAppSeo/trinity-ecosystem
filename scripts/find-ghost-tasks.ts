import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(url, key);

async function findGhostTasks() {
    console.log('--- [TRINITY GHOST TASK SEARCH] ---');

    // Check for null status
    const { count: nullCount } = await supabase.from('trinity_tasks').select('*', { count: 'exact', head: true }).is('status', null);
    console.log(`Status IS NULL: ${nullCount}`);

    // Check for other statuses
    const { data: samples } = await supabase.from('trinity_tasks').select('status').limit(100);
    const uniqueStatuses = [...new Set(samples?.map(s => s.status))];
    console.log('Unique statuses found in sample:', uniqueStatuses);

    // Get exact count of everything
    const { count: totalCount } = await supabase.from('trinity_tasks').select('*', { count: 'exact', head: true });
    console.log(`Total absolute count: ${totalCount}`);
}

findGhostTasks();
