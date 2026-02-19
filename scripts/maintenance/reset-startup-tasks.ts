import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function resetStartupTasks() {
    console.log('--- [RESETTING STARTUP TASKS] ---');

    const { data, error } = await supabase
        .from('trinity_tasks')
        .update({
            status: 'todo',
            result: null,
            claimed_by: null,
            assigned_to: null,
            completed_at: null
        })
        .or('title.ilike.%[STARTUP WEEKEND]%,title.ilike.%[SPRINT 0]%')
        .eq('status', 'failed');

    if (error) {
        console.error('Error resetting tasks:', error.message);
        return;
    }

    console.log('✅ Successfully reset failed Startup Weekend and Sprint 0 tasks to todo.');
}

resetStartupTasks();
