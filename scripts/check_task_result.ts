import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function checkTask(id: number) {
    const { supabase } = await import('../lib/supabase');
    const { data: task, error } = await supabase
        .from('trinity_tasks')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        console.error("Error:", error.message);
        return;
    }

    console.log(`Task ${id}: ${task.title}`);
    console.log(`Status: ${task.status}`);
    console.log(`Result: ${task.result}`);
    console.log(`Error Check: ${task.verification_result}`);
}

const taskId = parseInt(process.argv[2] || '118131');
checkTask(taskId);
