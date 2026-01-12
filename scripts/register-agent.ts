// @ts-nocheck
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

// Trusted Service Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qnnpjhlxljtqyigedwkb.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

interface AgentProfile {
    agent_name: string;
    specialties: string[];
    collaboration_methods: string;
    learned_knowledge: string;
    handoff_protocols: Record<string, string>;
}

export async function registerAgent(profile: AgentProfile) {
    console.log(`🆔 Registering Agent Identity: [${profile.agent_name}]...`);

    try {
        const { error } = await supabase
            .from('trinity_agent_profiles')
            .upsert({
                agent_name: profile.agent_name,
                specialties: profile.specialties,
                collaboration_methods: profile.collaboration_methods,
                learned_knowledge: profile.learned_knowledge,
                handoff_protocols: profile.handoff_protocols,
                updated_at: new Date().toISOString()
            }, { onConflict: 'agent_name' });

        if (error) {
            console.error(`💥 Registration Failed for ${profile.agent_name}:`, error.message);
            return false;
        }

        console.log(`✅ [${profile.agent_name}] Registered/Updated in Swarm Identity.`);
        return true;

    } catch (err: any) {
        console.error(`💥 Connection Error during registration:`, err.message);
        return false;
    }
}

// CLI Support: If run directly, register specific agents based on args or default list
if (require.main === module) {
    const runRegistration = async () => {
        // Example: HDM Self-Registration
        await registerAgent({
            agent_name: 'trinity-hdm',
            specialties: ['infrastructure', 'orchestration', 'self-healing'],
            collaboration_methods: 'Gossip protocol for alerts, API handoffs for docs',
            learned_knowledge: 'Learned to reroute during failures; optimized DAG consensus',
            handoff_protocols: { docs: "Share via Supabase insert", artifacts: "GitHub PR" }
        });

        // Example: SC (Scout) Self-Registration
        await registerAgent({
            agent_name: 'trinity-scout',
            specialties: ['uptime-monitoring', 'latency-checks', 'trauma-reporting'],
            collaboration_methods: 'Logs to trinity_runtime_errors',
            learned_knowledge: 'Identified recurring offline patterns during build times.',
            handoff_protocols: { alerts: "Log to SQL" }
        });
    };

    runRegistration();
}
