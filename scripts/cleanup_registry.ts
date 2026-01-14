import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const VALID_AGENTS = [
    // ALPHA
    'trinity-gcm', 'trinity-torch', 'trinity-veritas',
    // BETA
    'trinity-apm', 'trinity-chesed', 'trinity-mel',
    // GAMMA
    'trinity-hdm', 'trinity-nexus', 'trinity-sophia'
];

async function cleanupRegistry() {
    console.log('🧹 Cleaning up Agent Registry...');
    console.log(`ℹ️  Valid Agents: ${VALID_AGENTS.join(', ')}`);

    // 1. Delete from Registry
    const { error: regError, count: regCount } = await supabase
        .from('trinity_agent_registry')
        .delete({ count: 'exact' })
        .not('agent_name', 'in', `(${VALID_AGENTS.join(',')})`); // Syntax: not('col', 'in', '(a,b)')

    if (regError) console.error('❌ Registry Cleanup Failed:', regError.message);
    else console.log(`✅ Removed ${regCount ?? 'unknown'} invalid records from Agent Registry.`);

    // 2. Delete from Heartbeat (trinity_heartbeat)
    const { error: hbError, count: hbCount } = await supabase
        .from('trinity_heartbeat')
        .delete({ count: 'exact' })
        .not('agent', 'in', `(${VALID_AGENTS.join(',')})`);

    if (hbError) console.error('❌ Heartbeat Cleanup Failed:', hbError.message);
    else console.log(`✅ Removed ${hbCount ?? 'unknown'} invalid records from Heartbeat Table.`);

    // 3. Delete from Legacy Heartbeat (agent_heartbeat) if exists
    const { error: legError, count: legCount } = await supabase
        .from('agent_heartbeat')
        .delete({ count: 'exact' })
        .not('agent_name', 'in', `(${VALID_AGENTS.join(',')})`);

    if (legError) {
        // Table might not exist, ignore
    } else {
        console.log(`✅ Removed ${legCount ?? 'unknown'} invalid records from Legacy Heartbeat.`);
    }
}

cleanupRegistry();
