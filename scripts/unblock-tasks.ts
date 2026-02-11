
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function unblock() {
    console.log('🔓 Unblocking priority 80+ tasks for Gamma squad...');

    const { data: updated, error } = await supabase
        .from('trinity_tasks')
        .update({ requires_consensus: true })
        .gte('priority', 80)
        .eq('requires_consensus', false);

    if (error) {
        console.error('❌ Failed to unblock tasks:', error);
    } else {
        console.log('✅ Tasks updated to REQUIRES CONSENSUS.');
    }

    // Also unblock the specific one Sophia mentioned
    await supabase.from('trinity_tasks').update({ requires_consensus: true }).eq('id', 114651);
    console.log('✅ Specifically unblocked Task 114651');
}

unblock();
