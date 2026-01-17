import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function resetStalledTasks() {
    console.log('🔄 Identifying stalled tasks...');

    // 1. Move 'doing' and 'pending_clarification' back to 'pending'
    // This clears the Busy Worker Lock and allows renamed agents to claim them.
    const { data: stalled, error: fetchError } = await supabase
        .from('trinity_tasks')
        .select('id, title, claimed_by, status')
        .in('status', ['doing', 'pending_clarification', 'in_progress']);

    if (fetchError) {
        console.error('Error fetching stalled tasks:', fetchError);
        return;
    }

    if (!stalled || stalled.length === 0) {
        console.log('✅ No stalled tasks found.');
    } else {
        console.log(`Found ${stalled.length} stalled tasks. Resetting naming/state...`);

        const { error: updateError } = await supabase
            .from('trinity_tasks')
            .update({
                status: 'pending',
                claimed_by: null,
                claimed_at: null,
                assigned_to: null, // Fully reset for fresh claiming
                metadata: {} // Clear any transient state
            })
            .in('status', ['doing', 'pending_clarification', 'in_progress']);

        if (updateError) {
            console.error('Error resetting tasks:', updateError);
        } else {
            console.log('✅ Stalled tasks successfully returned to PENDING.');
        }
    }

    // 2. Clear Registry Status (Force Offline to trigger fresh heartbeats)
    console.log('📡 Resetting agent registry status for naming alignment...');
    const { error: registryError } = await supabase
        .from('trinity_agent_registry')
        .update({
            status: 'offline'
        })
        .neq('agent_name', 'RESERVED'); // Avoid system wide locks

    if (registryError) {
        console.error('Error resetting registry:', registryError);
    } else {
        console.log('✅ All agents marked OFFLINE. Ready for fresh boot.');
    }

    console.log('\n🚀 RECOVERY COMPLETE. Please apply UNIVERSAL_NAMING_V10.sql now.');
}

resetStalledTasks();
