import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function checkTasks() {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // Check for todo tasks
    const { data: todoTasks, error } = await supabase
        .from('trinity_tasks')
        .select('*')
        .in('status', ['todo', 'pending', 'pending_clarification'])
        .limit(10);

    if (error) {
        console.error('Error fetching tasks:', error.message);
        return;
    }

    console.log(`Found ${todoTasks?.length || 0} tasks in todo/pending state:`);
    todoTasks?.forEach(t => {
        console.log(`- [${t.id}] ${t.title} (Status: ${t.status}, Assigned: ${t.assigned_to}, ClaimedBy: ${t.claimed_by})`);
    });
}

checkTasks();
