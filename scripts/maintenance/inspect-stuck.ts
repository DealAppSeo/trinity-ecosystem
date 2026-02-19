import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectStuckTasks() {
    console.log("🔍 Inspecting 6 stuck tasks...");
    const { data: tasks, error } = await supabase
        .from('trinity_tasks')
        .select('*')
        .eq('status', 'doing');

    if (error) {
        console.error("Error:", error.message);
        return;
    }

    tasks?.forEach(t => {
        console.log(`- [${t.status}] ${t.title} | Claimed by: ${t.claimed_by} | Created at: ${t.created_at}`);
    });
}

inspectStuckTasks();
