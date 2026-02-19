import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function diagnose() {
    console.log('--- [FULL REGISTRY AUDIT] ---');
    const { data: registry } = await supabase.from('trinity_agent_registry').select('*').order('agent_name');
    console.log(`Registry Count: ${registry?.length}`);
    registry?.forEach(r => console.log(`- ${r.agent_name} (Status: ${r.status}, Last Active: ${r.last_active})`));

    console.log('\n--- [HEARTBEAT AUDIT] ---');
    const { data: heartbeats } = await supabase.from('trinity_heartbeat').select('*').order('agent');
    console.log(`Heartbeat Count: ${heartbeats?.length}`);
    heartbeats?.forEach(h => console.log(`- ${h.agent} (Last Seen: ${h.last_seen})`));
}

diagnose();
