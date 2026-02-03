import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function finalNuke() {
    console.log('🚀 Final Nuke Strategy: Archiving EVERYTHING in TODO/DOING/FAILED...');

    // Using a simpler query that just targets status
    const { error } = await supabase
        .from('trinity_tasks')
        .update({ status: 'archived' })
        .in('status', ['todo', 'doing', 'in_progress', 'running', 'failed', 'pending_clarification'])
        .neq('status', 'archived');

    if (error) {
        console.error('❌ Nuke Error:', error.message);
    } else {
        console.log('✅ Board Cleared.');
    }
}

finalNuke();
