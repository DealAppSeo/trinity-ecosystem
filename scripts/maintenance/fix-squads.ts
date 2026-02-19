
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { AGENT_WISDOM } from '../lib/agent/wisdom';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function fixSquads() {
    console.log('🔧 [FIX] Aligning Agent Registry with Wisdom (Squad IDs)...');

    for (const [name, wisdom] of Object.entries(AGENT_WISDOM)) {
        const agentName = name.toLowerCase().startsWith('trinity-') ? name.toLowerCase() : `trinity-${name.toLowerCase()}`;

        console.log(`[FIX] Agent: ${agentName} -> Squad: ${wisdom.squad}`);

        const { error } = await supabase
            .from('trinity_agent_registry')
            .update({ squad: wisdom.squad })
            .eq('agent_name', agentName);

        if (error) console.error(`  - Error updating ${agentName}:`, error.message);
    }

    console.log('\n✅ [FIX] Squad alignment complete.');
}

fixSquads();
