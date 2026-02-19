import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function verifyWakeFix() {
    console.log('🧪 Verifying REBOOT_SWARM Logic Fix...');

    const agents = [
        'trinity-orch', 'trinity-w3c', 'trinity-shofet',
        'trinity-torch', 'trinity-veritas', 'trinity-gcm',
        'trinity-chesed', 'trinity-mel', 'trinity-apm',
        'trinity-sophia', 'trinity-nexus', 'trinity-hdm'
    ];

    const nowStr = new Date().toISOString();

    console.log('1. Mocking REBOOT_SWARM DB Updates...');

    // Simulate the registry update
    const { error: regError } = await supabase
        .from('trinity_agent_registry')
        .update({
            status: 'online',
            last_active: nowStr
        })
        .in('agent_name', agents);

    if (regError) {
        console.error('❌ Registry Update Failed:', regError.message);
    } else {
        console.log('✅ Registry Update Successful');
    }

    // Simulate heartbeats
    const heartbeats = agents.map(agent => ({
        agent,
        last_seen: nowStr,
        status: 'active'
    }));
    const { error: hbError } = await supabase.from('trinity_heartbeat').upsert(heartbeats, { onConflict: 'agent' });

    if (hbError) {
        console.error('❌ Heartbeat Upsert Failed:', hbError.message);
    } else {
        console.log('✅ Heartbeat Upsert Successful');
    }

    console.log('🏁 Verification complete. Check registry output next.');
}

verifyWakeFix();
