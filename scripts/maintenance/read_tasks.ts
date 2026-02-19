import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function readLatestTasks() {
    console.log('📋 Reading Latest Tasks...');
    const { data: tasks, error } = await supabase
        .from('trinity_tasks')
        .select('id, title, status, assigned_to, task_type')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error('❌ Failed:', error);
        return;
    }

    tasks.forEach(t => {
        console.log(`[${t.status.toUpperCase()}] ${t.title} (Type: ${t.task_type}) -> ${t.assigned_to || 'Unassigned'}`);
    });
}

readLatestTasks();
