
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function emergencyFlush() {
    console.log('🚨 EMERGENCY FLUSH: Clearing all stuck claims and resets...');

    // 1. Reset all tasks that are NOT in a final state
    const { data: updated, error } = await supabase
        .from('trinity_tasks')
        .update({
            status: 'pending',
            claimed_by: null,
            assigned_to: null,
            result: '[EMERGENCY_FLUSH] Task reset'
        })
        .not('status', 'in', '(done,completed,verified,failed,success)')
        .select();

    if (error) {
        console.error('❌ Flush failed:', error.message);
    } else {
        console.log(`✅ Successfully flushed ${updated?.length || 0} tasks.`);
    }

    // 2. Clear Agent Registry statuses
    const { error: regError } = await supabase
        .from('trinity_agent_registry')
        .update({
            status: 'offline'
        })
        .neq('status', 'offline');

    if (regError) {
        console.error('❌ Registry flush failed:', regError.message);
    } else {
        console.log('✅ All agents marked as offline (waiting for fresh heartbeats).');
    }
}

emergencyFlush();
