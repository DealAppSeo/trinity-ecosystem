import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function diagnose() {
    console.log('--- [DASHBOARD DISCREPANCY DIAGNOSIS] ---');
    const now = new Date();

    // 1. Fetch Registry
    const { data: registry } = await supabase.from('trinity_agent_registry').select('*');
    // 2. Fetch Heartbeats
    const { data: heartbeats } = await supabase.from('trinity_heartbeat').select('*');

    console.log(`\nFound ${registry?.length} in Registry and ${heartbeats?.length} in Heartbeats.`);

    const threshold = 5 * 60 * 1000; // 5 minutes

    const activeFromRegistry = registry?.filter(a => {
        const lastActive = a.last_active ? new Date(a.last_active).getTime() : 0;
        return (now.getTime() - lastActive) < threshold;
    }).map(a => a.agent_name);

    const activeFromHeartbeats = heartbeats?.filter(h => {
        const lastSeen = h.last_seen ? new Date(h.last_seen).getTime() : 0;
        return (now.getTime() - lastSeen) < threshold;
    }).map(h => h.agent);

    console.log('\n--- Active by Registry (last_active < 5m):');
    console.log(activeFromRegistry);

    console.log('\n--- Active by Heartbeats (last_seen < 5m):');
    console.log(activeFromHeartbeats);

    // Find the overlap and differences
    const allActive = Array.from(new Set([...(activeFromRegistry || []), ...(activeFromHeartbeats || [])]));
    console.log(`\nTotal unique "Active" candidates: ${allActive.length}`);

    allActive.forEach(name => {
        const reg = registry?.find(r => r.agent_name === name);
        const hb = heartbeats?.find(h => h.agent === name);

        const regStatus = reg ? ((now.getTime() - new Date(reg.last_active).getTime()) < threshold ? 'ACTIVE' : 'STALE') : 'MISSING';
        const hbStatus = hb ? ((now.getTime() - new Date(hb.last_seen || 0).getTime()) < threshold ? 'ACTIVE' : 'STALE') : 'MISSING';

        console.log(`- ${name}: Registry:[${regStatus}] | Heartbeat:[${hbStatus}] | Status:[${reg?.status || '??'}]`);
    });

}

diagnose();
