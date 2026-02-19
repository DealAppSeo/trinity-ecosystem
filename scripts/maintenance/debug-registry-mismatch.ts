
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function debugRegistry() {
    console.log('--- [DEBUG] REGISTRY & HEARTBEAT SYNC ---');

    const { data: registry } = await supabase
        .from('trinity_agent_registry')
        .select('*');

    const { data: heartbeatLegacy } = await supabase
        .from('agent_heartbeat')
        .select('*');

    const { data: heartbeatNew } = await supabase
        .from('trinity_heartbeat')
        .select('*');

    const { data: tasks } = await supabase
        .from('trinity_tasks')
        .select('id, title, status, claimed_by')
        .in('status', ['doing', 'in_progress']);

    console.log('\n--- REGISTRY ---');
    console.table(registry?.map(r => ({ name: r.agent_name, squad: r.squad, status: r.status })));

    console.log('\n--- LEGACY HEARTBEATS ---');
    console.table(heartbeatLegacy?.map(h => ({ name: h.agent_name, last: h.last_seen })));

    console.log('\n--- NEW HEARTBEATS ---');
    console.table(heartbeatNew?.map(h => ({ name: h.agent, last: h.last_seen })));

    console.log('\n--- ACTIVE TASKS ---');
    console.table(tasks);

    console.log('\n--- NAME ANALYSIS ---');
    const registryNames = new Set(registry?.map(r => r.agent_name));
    const claimers = new Set(tasks?.map(t => t.claimed_by));

    claimers.forEach(c => {
        if (c && !registryNames.has(c)) {
            console.warn(`⚠️ ALERT: Task claimer "${c}" is NOT in trinity_agent_registry! UI will not show owner.`);
        }
    });

    console.log('--- [DEBUG] END ---');
}

debugRegistry();
