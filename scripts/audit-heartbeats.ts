import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function checkHeartbeats() {
    console.log('--- [SWARM COMPOSITION AUDIT] ---');
    const { data, error } = await supabase
        .from('trinity_heartbeat')
        .select('agent, status, last_seen, version');

    if (error) {
        console.error('Error fetching heartbeats:', error.message);
        return;
    }

    console.log(`Total Heartbeating Entities: ${data.length}`);
    data.forEach(h => {
        console.log(`[${h.status.toUpperCase()}] ${h.agent} | v${h.version || '?'}`);
    });
}

checkHeartbeats();
