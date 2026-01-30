import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function verify() {
    console.log("🔍 Verifying Training Missions in DB...");
    const { data: tasks, error } = await supabase
        .from('trinity_tasks')
        .select('title, status, task_type')
        .like('title', '[EASY-TRAINING]%');

    if (error) {
        console.error("❌ Verification failed:", error.message);
    } else {
        console.log(`Found ${tasks.length} training tasks:`);
        tasks.forEach(t => console.log(`- [${t.status}] ${t.title} (${t.task_type})`));
    }
}

verify();
