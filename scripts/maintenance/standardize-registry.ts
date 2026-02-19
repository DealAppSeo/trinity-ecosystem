import { supabase } from '../lib/supabase';
import { AGENT_WISDOM } from '../packages/agent-core/src/agent/wisdom';

async function standardizeRegistry() {
    console.log('--- STANDARDIZING AGENT REGISTRY (v2) ---');

    for (const [name, wisdom] of Object.entries(AGENT_WISDOM)) {
        console.log(`Registering ${name}...`);

        const { error } = await supabase
            .from('trinity_agent_registry')
            .upsert({
                agent_name: name,
                status: 'active',
                reputation_score: 50,
                last_active: new Date().toISOString()
            }, { onConflict: 'agent_name' });

        if (error) console.error(`Failed to register ${name}:`, error.message);
    }

    console.log('--- REGISTRY STANDARDIZED ---');
}

standardizeRegistry();
