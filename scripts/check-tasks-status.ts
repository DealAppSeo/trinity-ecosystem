import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTasks() {
    console.log("📊 Task Status Snapshot:");
    const { data: tasks, error } = await supabase
        .from('trinity_tasks')
        .select('id, title, status, claimed_by, verify_count')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error("❌ Error fetching tasks:", error.message);
        return;
    }

    if (!tasks || tasks.length === 0) {
        console.log("No tasks found.");
        return;
    }

    tasks.forEach(t => {
        console.log(`[${t.status.toUpperCase()}] ${t.title} | Agent: ${t.claimed_by || 'None'} | Verifications: ${t.verify_count || 0}`);
    });
}
checkTasks();
