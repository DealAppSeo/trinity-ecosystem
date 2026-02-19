import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function globalReset() {
    console.log('🚀 INITIATING GLOBAL SWARM RESET (Engagement v4)...');

    // 1. Clear all 'Sticky Claims' (Claims on tasks that are pending or clarifying)
    console.log('🧹 Clearing stale task claims...');
    const { error: claimError } = await supabase
        .from('trinity_tasks')
        .update({
            claimed_by: null,
            status: 'pending' // Force move everything back to 'To Do'
        })
        .in('status', ['pending', 'pending_clarification']);

    if (claimError) console.error('❌ Failed to clear claims:', claimError.message);
    else console.log('✅ Claims cleared.');

    // 2. Pulse the registry
    console.log('📡 Marking registry as healthy...');
    const { error: regError } = await supabase
        .from('trinity_agent_registry')
        .update({
            status: 'online',
            current_task_summary: '[RESET] Swarm balanced. Ready for work.'
        })
        .eq('status', 'idle');

    if (regError) console.error('❌ Failed to update registry:', regError.message);
    else console.log('✅ Registry pulsed.');

    console.log('\n✨ SWARM RESET COMPLETE. Agents will now pick up tasks using the new Alternating Workflow.');
}

globalReset();
