
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const specialistMissions = [
    {
        title: '[RESEARCH] Empathetic UI Audit (Chesed)',
        description: 'Audit the Trinity Controller artifacts for emotional resonance and user-centric clarity. Provide a sentiment analysis report on the current social mirror interactions.',
        task_type: 'research',
        priority: 95,
        status: 'pending',
        assigned_to: 'trinity-chesed',
        metadata: { swarm_state: 'research', focus: 'empathy-arbitrage' }
    },
    {
        title: '[RESEARCH] Network Security & RLS Audit (Nexus)',
        description: 'Deep audit of Supabase RLS policies and API gateway latency. Identify potential security vectors in the CNS (Central Neural Symphony) and propose hardening protocols.',
        task_type: 'research',
        priority: 95,
        status: 'pending',
        assigned_to: 'trinity-nexus',
        metadata: { swarm_state: 'research', focus: 'network-security' }
    },
    {
        title: '[RESEARCH] Deep Thought: Long-Horizon Arbitrage Reasoning (Sophia)',
        description: 'Evaluate the theoretical limits of MoE logic for multi-step financial arbitrage. Research the "Golden Ratio" efficiency in agentic decision trees across diverse LLM clusters.',
        task_type: 'research',
        priority: 98,
        status: 'pending',
        assigned_to: 'trinity-sophia',
        metadata: { swarm_state: 'research', focus: 'logical-arbitrage', reasoning: 'deep-thought' }
    }
];

async function activateSpecialists() {
    console.log('--- ACTIVATING SPECIALIST AGENTS ---');

    // 1. Reset Registry Status
    const specialists = ['trinity-chesed', 'trinity-nexus', 'trinity-sophia'];
    const { error: regError } = await supabase
        .from('trinity_agent_registry')
        .update({
            status: 'idle',
            current_task_summary: 'Awaiting specialized mission command...'
        })
        .in('agent_name', specialists);

    if (regError) console.error('Registry Reset Error:', regError);
    else console.log('Successfully reset registry status for specialists.');

    // 2. Seed Missions
    const { data, error } = await supabase
        .from('trinity_tasks')
        .insert(specialistMissions);

    if (error) {
        console.error('Error seeding specialized tasks:', error.message);
    } else {
        console.log('Successfully seeded 3 high-priority specialist missions.');
    }
}

activateSpecialists();
