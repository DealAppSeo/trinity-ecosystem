import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function forceTasks() {
    console.log('--- FORCING TASK PICKUP ---');
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // Update all pending missions to todo and unassign them
    const { data, error } = await supabase
        .from('trinity_tasks')
        .update({ status: 'todo', assigned_to: null })
        .in('status', ['pending', 'todo', 'pending_clarification']);

    if (error) {
        console.error('❌ Error updating tasks:', error.message);
    } else {
        console.log('✅ Tasks updated to TODO and unassigned. Agents should now pick them up.');
    }
}

forceTasks();
