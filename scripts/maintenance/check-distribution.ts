import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDistribution() {
    const { data, error } = await supabase
        .from('trinity_tasks')
        .select('claimed_by, status')
        .in('status', ['doing', 'in_progress']);

    if (error) {
        console.error('Error:', error.message);
        return;
    }

    const stats: Record<string, number> = {};
    data?.forEach(t => {
        const agent = t.claimed_by || 'unclaimed';
        stats[agent] = (stats[agent] || 0) + 1;
    });

    console.log('--- TASK DISTRIBUTION (DOING/IN_PROGRESS) ---');
    console.log(JSON.stringify(stats, null, 2));
    console.log('Total:', data?.length);
}

checkDistribution();
