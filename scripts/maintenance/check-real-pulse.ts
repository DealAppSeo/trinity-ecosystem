import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load keys (prioritize .env.local if exists, or standard .env)
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase Environment Variables in local .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPulse() {
    console.log('🔍 Checking Real Trinity Pulse...');
    console.log(`🔗 Connecting to: ${supabaseUrl}`);

    // 1. Check Registry
    const { data: agents, error: agentError } = await supabase
        .from('trinity_agent_registry')
        .select('*');

    if (agentError) {
        console.error('❌ Error fetching Agents:', agentError.message);
    } else {
        console.log(`✅ Agents Found: ${agents?.length || 0}`);
        agents?.forEach(a => console.log(`   - ${a.agent_name} [${a.status}] (Tier ${a.tier})`));
    }

    // 2. Check Heartbeats
    const { data: heartbeats, error: hbError } = await supabase
        .from('trinity_heartbeat')
        .select('*');

    if (hbError) {
        console.error('❌ Error fetching Heartbeats:', hbError.message);
    } else {
        console.log(`✅ Heartbeats Found: ${heartbeats?.length || 0}`);
        const now = new Date().getTime();
        heartbeats?.forEach(h => {
            const lastSeen = new Date(h.last_seen).getTime();
            const diff = (now - lastSeen) / 1000;
            const status = diff < 60 ? '🟢 LIVE' : '🔴 STALE';
            console.log(`   - ${h.agent}: ${status} (${diff.toFixed(0)}s ago)`);
        });
    }

    // 3. Env Check
    console.log('\n📝 Environment Check:');
    console.log(`   URL: ${supabaseUrl ? 'OK' : 'MISSING'}`);
    console.log(`   KEY: ${supabaseKey ? 'OK (Length: ' + supabaseKey.length + ')' : 'MISSING'}`);
}

checkPulse();
