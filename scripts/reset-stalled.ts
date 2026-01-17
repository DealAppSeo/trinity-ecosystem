import { supabaseAdmin as supabase } from '../lib/supabase';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function resetInProgress() {
    console.log('--- RESETTING STALLED TASKS ---');

    // 1. Move in_progress tasks back to pending if they are from the last mission
    const { data: updated, error } = await supabase
        .from('trinity_tasks')
        .update({
            status: 'pending',
            claimed_by: null,
            started_at: null,
            metadata: {} // Clear stalling metadata if any
        })
        .eq('status', 'in_progress');

    if (error) {
        console.error('Failed to reset tasks:', error.message);
    } else {
        console.log(`Successfully reset tasks to pending.`);
    }

    console.log('--- RESET COMPLETE ---');
}

resetInProgress();
