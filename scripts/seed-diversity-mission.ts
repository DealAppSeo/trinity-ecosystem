import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const MISSIONS = [
    {
        title: '[MISSION: CODE] Glassmorphism Dashboard Card',
        description: 'Design and implement a React component for a "Glassmorphism" dashboard card. \n\nRequirements:\n1. Use Tailwind CSS with backdrop-blur.\n2. Include an icon, title, and a "Live" status indicator.\n3. Implementation must be TypeScript.\n4. Artifact name: GlassCard.tsx',
        task_type: 'code',
        priority: 85,
        assigned_to: 'GAMMA' // Design/Build Squad
    },
    {
        title: '[MISSION: DESIGN] Swarm Intelligence Flowchart',
        description: 'Visualize the "Three-Way Wake" protocol using Mermaid syntax. \n\nRequirements:\n1. Show UptimeRobot, Railway, and Sibling Agents.\n2. Label the directions of the pings (Inbound, Outbound, Horizontal).\n3. Artifact name: WakeFlow.mermaid',
        task_type: 'design',
        priority: 85,
        assigned_to: 'BETA' // Logic/Diagram Squad
    },
    {
        title: '[MISSION: RESEARCH] Neural Search Comparison',
        description: 'Perform a deep dive research into Tavily vs Exa vs You.com APIs for agentic research. \n\nRequirements:\n1. Compare accuracy, latency, and "cleanliness" of content.\n2. Provide a recommendation for "Phase 13" empowerment.\n3. Artifact name: Search_API_Battle.md',
        task_type: 'research',
        priority: 85,
        assigned_to: 'ALPHA' // Truth/Research Squad
    },
    {
        title: '[MISSION: CONTENT] The Trinity Manifesto (Introduction)',
        description: 'Draft the intro section of "The Trinity Manifesto". \n\nRequirements:\n1. Focus on the philosophy of "Antifragility through Swarm Intelligence".\n2. Tone: Intellectual, Visionary, Patent-Pending.\n3. Artifact name: Manifesto_Intro.md',
        task_type: 'content',
        priority: 85,
        assigned_to: 'ORCH' // Coordination Squad
    }
];

async function seedDiversityMission() {
    console.log('🌌 Seeding Diversity Mission: [CODE | DESIGN | RESEARCH | CONTENT]');

    const { error } = await supabase.from('trinity_tasks').insert(
        MISSIONS.map(m => ({
            ...m,
            status: 'pending',
            created_at: new Date().toISOString(),
            metadata: { mission: 'DIVERSITY_V1', test_type: 'artifact_variation' }
        }))
    );

    if (error) {
        console.error('❌ Diversity Mission Seeding Failed:', error.message);
    } else {
        console.log('✅ Diversity Mission Seeded Successfully! 4 High-Fidelity tasks added.');
    }
}

seedDiversityMission();
