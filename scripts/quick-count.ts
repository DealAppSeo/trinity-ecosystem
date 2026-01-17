import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function count() {
    const { count, error } = await supabase.from('trinity_tasks').select('*', { count: 'exact', head: true });
    console.log('Current Exact Task Count:', count);
    if (error) console.error('Error:', error.message);
}

count();
