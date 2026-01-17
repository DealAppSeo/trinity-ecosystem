import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(url, key);

async function check() {
    const { data: artifacts, error } = await supabase
        .from('trinity_artifacts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error('Error fetching artifacts:', error.message);
    } else {
        console.log(`--- LATEST ARTIFACTS (${artifacts?.length || 0}) ---`);
        artifacts?.forEach(a => {
            console.log(`[${a.created_at}] ${a.creator_agent}: ${a.title} (${a.url})`);
        });
    }

    const { data: tasks } = await supabase
        .from('trinity_tasks')
        .select('*')
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(5);

    console.log(`\n--- LATEST COMPLETED TASKS (${tasks?.length || 0}) ---`);
    tasks?.forEach(t => {
        console.log(`[${t.completed_at}] ${t.assigned_to}: ${t.title}`);
    });
}

check();
