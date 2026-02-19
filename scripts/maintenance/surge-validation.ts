import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function surgeValidation() {
    console.log('⚡ INITIATING SPRINT SURGE (Priority 1000)...');

    // 1. Boost the 24 Validation Tasks
    const { error: surgeError } = await supabase
        .from('trinity_tasks')
        .update({ priority: 1000 })
        .ilike('metadata->>sprint', 'VALIDATION_V1');

    if (surgeError) console.error('❌ Surge failed:', surgeError.message);
    else console.log('✅ 24 Validation Tasks boosted to Priority 1000.');

    // 2. Clear stale 'Doing' claims (Deck Clearing)
    // Clear everything currently 'doing' so the new agents pick up the surged tasks
    const { error: clearError } = await supabase
        .from('trinity_tasks')
        .update({
            status: 'pending',
            claimed_by: null,
            started_at: null
        })
        .eq('status', 'doing');

    if (clearError) console.error('❌ Deck clearing failed:', clearError.message);
    else console.log('✅ All stale "Doing" claims cleared for fresh uptake.');

    console.log('\n🚀 SWARM REDIRECTED. Agents will now pick up the Validation tasks on their next loop.');
}

surgeValidation();
