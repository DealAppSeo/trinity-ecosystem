import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load env from project root
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function resetV8() {
    console.log('--- HYPERDAG v8.0 RESET ---');

    // 1. Purge [VERITAS] and [VERIFY] tasks (The "General Cycle" will handle these now)
    console.log('Deleting legacy [VERIFY] tasks...');
    const { error: delError } = await supabase
        .from('trinity_tasks')
        .delete()
        .or('title.ilike.[VERIFY]%,title.ilike.[VERITAS]%');

    if (delError) console.error('Error deleting tasks:', delError.message);

    // 2. Reset [EVERGREEN] tasks to To Do
    console.log('Resetting Evergreen tasks to "To Do"...');
    const { error: resetError } = await supabase
        .from('trinity_tasks')
        .update({
            status: 'pending',
            claimed_by: null,
            claimed_at: null,
            result: null,
            started_at: null,
            completed_at: null,
            verify_count: 0,
            verified_by: []
        })
        .ilike('title', '[EVERGREEN]%');

    if (resetError) console.error('Error resetting evergreens:', resetError.message);

    // 3. Move Stuck 'in_progress' tasks to To Do (to allow reclaiming)
    console.log('Unstucking existing tasks...');
    const { error: stuckError } = await supabase
        .from('trinity_tasks')
        .update({
            status: 'pending',
            claimed_by: null,
            claimed_at: null
        })
        .eq('status', 'in_progress');

    if (stuckError) console.error('Error unstucking tasks:', stuckError.message);

    console.log('--- RESET COMPLETE ---');
}

resetV8();
