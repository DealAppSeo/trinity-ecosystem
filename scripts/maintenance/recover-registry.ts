
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const AGENTS = [
    { name: 'trinity-orch', squad: 'ORCHESTRATION', role: 'Orchestrator' },
    { name: 'trinity-w3c', squad: 'ORCHESTRATION', role: 'Web3 Consensus' },
    { name: 'trinity-shofet', squad: 'ORCHESTRATION', role: 'Judge' },
    { name: 'trinity-veritas', squad: 'ALPHA', role: 'Truth & Verification' },
    { name: 'trinity-torch', squad: 'ALPHA', role: 'Explorer' },
    { name: 'trinity-gcm', squad: 'ALPHA', role: 'Global Coordination' },
    { name: 'trinity-mel', squad: 'BETA', role: 'Creative & Experience' },
    { name: 'trinity-chesed', squad: 'BETA', role: 'Mercy & Wellbeing' },
    { name: 'trinity-apm', squad: 'BETA', role: 'Performance' },
    { name: 'trinity-hdm', squad: 'GAMMA', role: 'Infrastructure' },
    { name: 'trinity-sophia', squad: 'GAMMA', role: 'Wisdom' },
    { name: 'trinity-nexus', squad: 'GAMMA', role: 'Integration' }
];

async function recoverRegistry() {
    console.log('--- [MAINTENANCE] RECOVERING AGENT REGISTRY ---');

    for (const agent of AGENTS) {
        const { error } = await supabase
            .from('trinity_agent_registry')
            .upsert({
                agent_name: agent.name,
                status: 'offline', // Will be updated to 'online' via heartbeat
                reputation_score: 50,
                tasks_completed: 0,
                last_active: new Date().toISOString()
            }, { onConflict: 'agent_name' });

        if (error) {
            console.error(`Error registering ${agent.name}:`, error.message);
        } else {
            console.log(`✅ Registered ${agent.name} (${agent.squad})`);
        }
    }

    console.log('--- [MAINTENANCE] REGISTRY RECOVERY COMPLETE ---');
}

recoverRegistry();
