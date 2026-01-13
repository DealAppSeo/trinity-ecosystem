import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function checkSprintStatus() {
    console.log('🔍 Checking Sprint Task Status...');
    const { data: task } = await supabase
        .from('trinity_tasks')
        .select('*')
        .ilike('title', '%SPRINT%Generate 200%')
        .single();

    if (task) {
        console.log(`Task: [${task.status}] ${task.title}`);
        console.log(`Assigned To: ${task.assigned_to || 'UNASSIGNED'}`);
        console.log(`Claimed By: ${task.claimed_by || 'NONE'}`);
        console.log(`Started At: ${task.started_at}`);

        if (task.status === 'in_progress' && task.claimed_by) {
            console.log('✅ SUCCESS: Task effectively claimed and running.');
        } else if (task.status === 'pending') {
            console.log('⏳ WAITING: Task still pending. Agent loop may be slow (15s interval).');
        }
    } else {
        console.log('❌ Task not found.');
    }
}

checkSprintStatus();
