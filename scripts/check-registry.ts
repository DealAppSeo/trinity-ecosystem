import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function checkRegistry() {
    console.log('📋 Checking Trinity Agent Registry...');

    // Get all registered agents
    const { data: agents, error } = await supabase
        .from('trinity_agent_registry')
        .select('*')
        .order('agent_name');

    if (error) {
        console.error('❌ Failed:', error.message);
        return;
    }

    console.log(`Found ${agents.length} agents:`);
    agents.forEach(a => {
        console.log(`- ${a.agent_name} (Tier: ${a.current_tier})`);
    });

    console.log('\nChecking Heartbeats for these agents...');
    const { data: heartbeats } = await supabase.from('trinity_heartbeat').select('*');
    const hbMap = new Map(heartbeats?.map(h => [h.agent, h.last_seen]));

    const now = new Date();
    agents.forEach(a => {
        const lastSeen = hbMap.get(a.agent_name);
        if (!lastSeen) {
            console.log(`❌ ${a.agent_name}: NO HEARTBEAT`);
        } else {
            const diff = now.getTime() - new Date(lastSeen).getTime();
            const mins = (diff / 60000).toFixed(1);
            console.log(`${diff < 120000 ? '🟢' : '🔴'} ${a.agent_name}: Last seen ${lastSeen} (${mins} mins ago)`);
        }
    });

    // Check for GCM specifically if not in registry
    const gcmHb = heartbeats?.find(h => h.agent === 'GCM');
    if (gcmHb) {
        console.log(`\nFound Unregistered Heatbeat: GCM (Last seen ${gcmHb.last_seen})`);
    }
}

checkRegistry();
