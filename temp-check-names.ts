
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkNames() {
    const { data: heartbeats } = await supabase.from('trinity_heartbeat').select('agent');
    const { data: legacyHeartbeats } = await supabase.from('agent_heartbeat').select('agent_name');
    const { data: registry } = await supabase.from('trinity_agent_registry').select('agent_name');

    console.log('Unique Heartbeat (New) Names:', Array.from(new Set(heartbeats?.map(h => h.agent))));
    console.log('Unique Heartbeat (Legacy) Names:', Array.from(new Set(legacyHeartbeats?.map(h => h.agent_name))));
    console.log('Unique Registry Names:', Array.from(new Set(registry?.map(r => r.agent_name))));
}

checkNames();
