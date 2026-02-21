
import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load ENV
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

const accelerationTasks = [
    {
        title: "[STRATEGY] [NEXUS] Comprehensive Technical Architecture & xMemory Deep-Dive",
        description: "As the Infrastructure Lead, create a detailed technical write-up of the AI Trinity Symphony architecture. Focus on the PRAL loop, xMemory 4-tier hierarchy, and the current state layer (DragonflyDB). Use Mermaid.js for diagrams. Output: ARCHITECTURE_DEEP_DIVE.md",
        task_type: 'code',
        priority: 100,
        status: 'todo',
        metadata: { squad: 'GAMMA', required_artifacts: ['ARCHITECTURE_DEEP_DIVE.md'] }
    },
    {
        title: "[STRATEGY] [VERITAS] AI Trinity Symphony White Paper V1: The Resonant Protocol",
        description: "As the Chief Data Scientist, draft the first version of our white paper. Detail the 'Constitutional Agency' model, the intersection of Phil. 4:8 virtues with AGI safety (OpenClaw), and our unique value proposition in the agentic economy. Output: WHITE_PAPER_V1.md",
        task_type: 'research',
        priority: 95,
        status: 'todo',
        metadata: { squad: 'ALPHA', required_artifacts: ['WHITE_PAPER_V1.md'] }
    },
    {
        title: "[GROWTH] [TORCH] Social Visibility: 'Resurrecting the Symphony' LinkedIn/X Campaign",
        description: "As the Social Media Expert, draft a high-impact announcement regarding the successful restoration of the Trinity Infrastructure. Focus on the vision for 2026 and the power of distributed, virtuous swarms. Output: VIRAL_ANNOUNCEMENT.md",
        task_type: 'content',
        priority: 90,
        status: 'todo',
        metadata: { squad: 'ALPHA', required_artifacts: ['VIRAL_ANNOUNCEMENT.md'] }
    },
    {
        title: "[BUSINESS] [SOPHIA] 2026 AI Grant & Hackathon Scouting Report",
        description: "As the BD Lead, research upcoming 2026 grants, hackathons, and accelerator prizes focused on Agentic AI, Web3 Convergence, and AGI Safety. Rank them by total prize pool and strategic alignment with Trinity. Output: SCOUTING_REPORT_2026.csv",
        task_type: 'business',
        priority: 85,
        status: 'todo',
        metadata: { squad: 'GAMMA', required_artifacts: ['SCOUTING_REPORT_2026.csv'] }
    },
    {
        title: "[INNOVATION] [MEL] Blue Ocean Strategy: Lean Startup Pivot Analysis",
        description: "As the Lead Designer, conduct a blue ocean analysis of the 'Agentic Web' market. Identify a high-value niche we can claim via a lean startup pivot (e.g. AI-driven governance or verified memory-as-a-service). Output: BLUE_OCEAN_STRATEGY.json",
        task_type: 'design',
        priority: 80,
        status: 'todo',
        metadata: { squad: 'BETA', required_artifacts: ['BLUE_OCEAN_STRATEGY.json'] }
    },
    {
        title: "[STARTUP] [CHESED] Startup Weekend MVP: Viral Loop & Retention Engine",
        description: "As the Growth Hacker, define the viral loop and retention mechanics for our Startup Weekend project. Ensure the UX encourages organic agent-to-user growth. Output: RETENTION_ENGINE_SPEC.md",
        task_type: 'strategy',
        priority: 75,
        status: 'todo',
        metadata: { squad: 'BETA', required_artifacts: ['RETENTION_ENGINE_SPEC.md'] }
    }
];

async function seedAcceleration() {
    console.log('--- SEEDING STRATEGIC ACCELERATION MISSIONS ---');

    const { data, error } = await supabase.from('trinity_tasks').insert(accelerationTasks).select();

    if (error) {
        console.error('Seeding error:', error.message);
        return;
    }

    console.log(`✅ Successfully seeded Strategic Acceleration: ${data.length} high-value missions.`);
}

seedAcceleration();
