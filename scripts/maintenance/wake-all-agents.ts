import * as dotenv from 'dotenv';
const result = dotenv.config({ path: '.env.local' });
console.log('[DEBUG] Dotenv loaded:', result.parsed ? 'SUCCESS' : 'FAILED');
import { supabaseAdmin as supabase } from '../lib/supabase';
console.log('[DEBUG] Supabase Admin initialized. Service Key Present:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);

async function wakeSwarm() {
    console.log('🌊 WAKING ENTIRE TRINITY SWARM...');

    const agents = [
        'trinity-orch', 'trinity-w3c', 'trinity-shofet',
        'trinity-veritas', 'trinity-torch', 'trinity-gcm',
        'trinity-mel', 'trinity-chesed', 'trinity-apm',
        'trinity-sophia', 'trinity-nexus', 'trinity-hdm'
    ];

    for (const agent of agents) {
        console.log(`📡 Sending pulse to ${agent}...`);

        // 1. Update Registry
        const { error: regError } = await supabase
            .from('trinity_agent_registry')
            .update({
                status: 'online',
                last_active: new Date().toISOString()
            })
            .eq('agent_name', agent);

        if (regError) console.error(`[${agent}] Registry Error:`, regError.message);

        // 2. Insert/Upsert Heartbeat
        const { error: hbError } = await supabase
            .from('trinity_heartbeat')
            .upsert({
                agent: agent,
                status: 'Symphony-Synced: Operational Readiness Confirmed.',
                last_seen: new Date().toISOString()
            }, { onConflict: 'agent' });

        if (hbError) console.error(`[${agent}] Heartbeat Error:`, hbError.message);
        else console.log(`[${agent}] ✅ PULSE SYNCHRONIZED.`);
    }

    console.log('--- SWARM WOKEN ---');
}

wakeSwarm().catch(console.error);
