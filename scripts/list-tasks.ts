
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function listTasks() {
    const { data, error } = await supabase
        .from('trinity_tasks')
        .select('id, title, priority, requires_consensus, status, claimed_by')
        .eq('id', 114651)
        .single();

    if (error) {
        console.error('Error fetching tasks:', error);
        return;
    }

    console.log(JSON.stringify(data, null, 2));
}

listTasks();
