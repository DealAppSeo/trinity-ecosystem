
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function insertTestTask() {
    const { data, error } = await supabase.from('trinity_tasks').insert({
        title: '[SYSTEM] Artifact Capability Test',
        description: 'Create a test artifact to verify write permissions. Please generate a short poem about resilience.',
        task_type: 'content',
        priority: 10,
        assigned_to: 'MEL', // One of the active agents
        status: 'pending'
    }).select();

    if (error) console.error('Error:', error);
    else console.log('Task inserted:', data);
}

insertTestTask();
