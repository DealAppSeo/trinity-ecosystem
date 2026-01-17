import { supabase } from '../lib/supabase';

async function clean() {
    console.log('--- STARTING TRUTH ALIGNMENT CLEANUP ---');

    // Standardize all agent-related tables to use 'trinity-name' format

    // 1. Trinity Heartbeat (Header source)
    const { data: hbBefore } = await supabase.from('trinity_heartbeat').select('agent');
    console.log('Heartbeat current agents:', hbBefore?.map(a => a.agent));

    await supabase.from('trinity_heartbeat').delete().not('agent', 'ilike', 'trinity-%');

    // 2. Agent Heartbeat (Legacy source)
    await supabase.from('agent_heartbeat').delete().not('agent_name', 'ilike', 'trinity-%');

    // 3. Agent Registry (The core grid source)
    // We must be careful not to delete records that have valid stats but wrong names.
    // However, since we've already unified the code, new heartbeats will come from trinity-names.
    await supabase.from('trinity_agent_registry').delete().not('agent_name', 'ilike', 'trinity-%');

    console.log('--- CLEANUP COMPLETE ---');
}

clean();
