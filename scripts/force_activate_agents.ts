
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load ENV
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function activateAgents() {
    console.log('⚡ Activating Swarm Agents (Repairing Registry Status)...');

    // 1. Fetch all agents
    const { data: agents } = await supabase.from('trinity_agent_registry').select('*');

    if (!agents || agents.length === 0) {
        console.log('❌ No agents found to activate.');
        return;
    }

    console.log(`Found ${agents.length} agents. Setting status to 'idle'...`);

    // 2. Update Status to 'idle'
    const { error } = await supabase
        .from('trinity_agent_registry')
        .update({ status: 'idle' })
        .neq('status', 'active'); // Don't interrupt active ones if any (though likely undefined)

    if (error) {
        console.error('❌ Error activating agents:', error.message);
    } else {
        console.log('✅ Success! All agents are now IDLE and ready to bid.');
        console.log('   (Gamma Squad should now appear on the dashboard)');
    }
}

activateAgents();
