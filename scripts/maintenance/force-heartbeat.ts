import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function forceHeartbeat() {
    console.log('💓 Forcing HDM Heartbeat...');

    const { error } = await supabase
        .from('trinity_heartbeat')
        .upsert({
            agent: 'trinity-hdm',
            last_seen: new Date().toISOString(),
            status: 'active'
        }, { onConflict: 'agent' }); // agent column name might be 'agent' or 'agent_name' - assuming 'agent' based on check-registry

    if (error) console.error('❌ Failed:', error.message);
    else console.log('✅ Force Heartbeat Sent for trinity-hdm');
}

forceHeartbeat();
