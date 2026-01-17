import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(url, key);

async function check() {
    // Try to find ANY artifact created today
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase.from('trinity_artifacts').select('*').gte('created_at', today);

    if (error) {
        console.error('Error:', error.message);
    } else {
        console.log(`Artifacts found for today: ${data?.length || 0}`);
        data?.forEach(a => {
            console.log(`[${a.id}] ${a.title || a.task_id} - ${a.creator_agent || a.agent}`);
        });
    }
}

check();
