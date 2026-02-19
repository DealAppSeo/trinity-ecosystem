import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function resetAndTrigger() {
    console.log('⚡ RESETTING SPRINT TASK TO PENDING...');

    const { data: tasks, error: taskError } = await supabase
        .from('trinity_tasks')
        .select('*')
        .ilike('title', '%SPRINT%Generate 200%')
        .single();

    if (tasks) {
        console.log(`Resetting task ${tasks.id} (Current: ${tasks.status})`);
        const { error } = await supabase
            .from('trinity_tasks')
            .update({
                status: 'pending', // AGENT ONLY POLLS PENDING
                assigned_to: 'trinity-sophia',
                started_at: null
            })
            .eq('id', tasks.id);

        if (error) console.error('❌ Reset failed:', error.message);
        else console.log('✅ Task Reset to PENDING. Sophia should pick it up in <15s.');
    } else {
        console.error('❌ Sprint task not found.');
    }
}

resetAndTrigger();
