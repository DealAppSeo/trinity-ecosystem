import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const EVERGREEN_MISSIONS = [
    // TIER 1: EASY - System Awareness & Metadata
    {
        title: '[EVERGREEN] [TIER-1] Registry Integrity Pulse',
        description: 'Verify the current trinity_agent_registry. Find any agent with a reputation_score below 40 and report them. \n\nDirectives:\n1. Audit registry table.\n2. Create a clean markdown list of all 12 agents and their status.\n3. Artifact: Registry_Audit_Pulse.md',
        task_type: 'research',
        priority: 10,
        assigned_to: 'ALPHA' // Truth squad
    },
    {
        title: '[EVERGREEN] [TIER-1] Artifact Library Audit',
        description: 'List the titles of the last 5 artifacts created. \n\nDirectives:\n1. Query trinity_artifacts.\n2. Create a simple table showing Artifact ID, Title, and Creator.\n3. Artifact: Recent_Artifacts_Summary.md',
        task_type: 'research',
        priority: 10,
        assigned_to: 'BETA' // Logic/Care squad
    },

    // TIER 2: MEDIUM - Design & Code Generation
    {
        title: '[EVERGREEN] [TIER-2] High-Fidelity Status Badge (React)',
        description: 'Design a series of React status badges (Online, Busy, Idle, Zombie) using Tailwind CSS. \n\nDirectives:\n1. Use vibrant, semantic colors (Emerald, Amber, Rose, Slate).\n2. Add subtle pulse animations for "Online".\n3. Implementation must be TypeScript.\n4. Artifact: StatusBadges.tsx',
        task_type: 'code',
        priority: 20,
        assigned_to: 'GAMMA' // Build squad
    },
    {
        title: '[EVERGREEN] [TIER-2] System Architecture Map (Mermaid)',
        description: 'Visualize the connection between the "Controller App" and the "Science Brain". \n\nDirectives:\n1. Use Mermaid syntax (graph TD).\n2. Show data flowing via Supabase and Direct API calls.\n3. Artifact: Trinity_System_Map.mermaid',
        task_type: 'design',
        priority: 20,
        assigned_to: 'GAMMA'
    },

    // TIER 3: CHALLENGING - Deep Logic & Learning
    {
        title: '[EVERGREEN] [TIER-3] Zero-Cost Wake Efficiency Report',
        description: 'Analyze the recent logs and verify that the "Quiet Heartbeat" protocol is working. \n\nDirectives:\n1. Search logs for "[HEARTBEAT]" tasks.\n2. Confirm that no LLM tokens were spent on these.\n3. Calculate hypothetical savings for a 24-hour period.\n4. Artifact: Wake_Efficiency_Analysis.md',
        task_type: 'research',
        priority: 30,
        assigned_to: 'ORCH' // Orchestration
    }
];

async function seedEvolutionaryEvergreen() {
    console.log('🌱 Seeding [EVERGREEN] Evolutionary Mission Stack...');

    const { error } = await supabase.from('trinity_tasks').insert(
        EVERGREEN_MISSIONS.map(m => ({
            ...m,
            status: 'pending',
            created_at: new Date().toISOString(),
            metadata: {
                mission_type: 'EVERGREEN_EVOLUTION',
                standard: 'V8.1.5',
                requires_artifact: true
            }
        }))
    );

    if (error) {
        console.error('❌ Seeding failed:', error.message);
    } else {
        console.log(`✅ Successfully seeded ${EVERGREEN_MISSIONS.length} evolutionary missions.`);
    }
}

seedEvolutionaryEvergreen();
