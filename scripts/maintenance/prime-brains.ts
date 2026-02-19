import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const SQUAD_DIRECTIVES: Record<string, string> = {
    'ALPHA': `OVERNIGHT MISSION: You are the Truth Seekers. Your focus tonight is on research, content, and system audit. 
1. Maintain high veracity in all reports.
2. Ensure all insights are persisted to the wisdom library.
3. If you find a bottleneck, document it immediately.`,
    'BETA': `OVERNIGHT MISSION: You are the Architects of Care. Your focus tonight is on UI, UX, and aesthetic consistency. 
1. Every design artifact must follow 'Liquid Glass' principles.
2. Prioritize user-centric flows.
3. Use Figma and Creative tools to visualize the future of Trinity.`,
    'GAMMA': `OVERNIGHT MISSION: You are the Builders of the Void. Your focus tonight is on code quality, infrastructure, and self-healing. 
1. Every code change MUST include a Mermaid documentation diagram.
2. Prioritize anti-fragility and error resilience.
3. Optimize for performance and low-latency task processing.`
};

async function prime() {
    console.log("🧠 Priming Agent Brains with Overnight Directives...");

    // Fetch all agents to map them to squads
    const { data: agents } = await supabase.from('trinity_agent_registry').select('agent_name, squad');

    if (!agents) return;

    for (const agent of agents) {
        const directive = SQUAD_DIRECTIVES[agent.squad as string];
        if (directive) {
            console.log(`Setting prompt for ${agent.agent_name}...`);
            await supabase.from('trinity_agent_registry')
                .update({ system_prompt: directive })
                .eq('agent_name', agent.agent_name);
        }
    }
    console.log("✅ Brains primed.");
}

prime();
