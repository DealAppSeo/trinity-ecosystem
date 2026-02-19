import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(url, key);

async function recover() {
    console.log('--- [TRINITY TASK RECOVERY] ---');

    // 1. Reset tasks that have been in_progress for more than 30 minutes
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60000).toISOString();

    const { data: stuck, error: fetchError } = await supabase
        .from('trinity_tasks')
        .select('id, title, claimed_by')
        .eq('status', 'in_progress')
        .lt('started_at', thirtyMinsAgo);

    if (fetchError) {
        console.error('❌ Error fetching stuck tasks:', fetchError.message);
        return;
    }

    console.log(`Found ${stuck?.length || 0} stuck tasks.`);

    if (stuck && stuck.length > 0) {
        const { error: updateError } = await supabase
            .from('trinity_tasks')
            .update({
                status: 'pending',
                claimed_by: null,
                started_at: null,
                metadata: JSON.stringify({ recovery: 'Reset due to timeout', reset_at: new Date().toISOString() })
            })
            .in('id', stuck.map(t => t.id));

        if (updateError) {
            console.error('❌ Reset failed:', updateError.message);
        } else {
            console.log('✅ Successfully reset stuck tasks to pending.');
        }
    }

    // 2. Align evergreen tasks (ensure assigned_to is correct)
    const { error: alignError } = await supabase
        .from('trinity_tasks')
        .update({ status: 'pending' })
        .eq('status', 'in_progress')
        .is('started_at', null); // Tasks claimed but never started

    console.log('--- [RECOVERY COMPLETE] ---');
}

recover();
