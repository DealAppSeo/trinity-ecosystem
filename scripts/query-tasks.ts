import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qnnpjhlxljtqyigedwkb.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function queryTasks() {
    console.log('🔍 Querying recent tasks...');
    const { data, error } = await supabase
        .from('trinity_tasks')
        .select('id, title, status, agent_assigned, created_at')
        .or('title.ilike.%crypto%,title.ilike.%prediction%,title.ilike.%cycle%')
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) {
        console.error('❌ Error:', error.message);
        return;
    }

    if (!data || data.length === 0) {
        console.log('📭 No tasks found matching criteria.');
        return;
    }

    console.table(data);
}

queryTasks();
