
import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load ENV
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

const sprint0Tasks = [
    {
        title: "[SPRINT 0] [VERITAS] Market Gap Identification: AI x Web3 Convergence",
        description: "As the Data Scientist, research the top 3 unserved pain points for Web3 developers wanting to integrate AI agents. Output a Market_Gap_Matrix.csv and a brief summary of the #1 Opportunity.",
        task_type: 'research',
        priority: 100,
        status: 'todo',
        metadata: { squad: 'ALPHA', required_artifacts: ['Market_Gap_Matrix.csv'] }
    },
    {
        title: "[SPRINT 0] [MEL] User Story & Persona Mapping for #1 Opportunity",
        description: "As the UX/UI Designer, create 5 User Stories for the #1 opportunity identified in the Market Gap analysis. Describe the 'Aha!' moment and the pain points solved. Output a Personas.json and User_Stories.md.",
        task_type: 'design',
        priority: 95,
        status: 'todo',
        metadata: { squad: 'BETA', required_artifacts: ['Personas.json', 'User_Stories.md'] }
    },
    {
        title: "[SPRINT 0] [NEXUS] Technical MVP Specification & API Interface",
        description: "As the Full-Stack Engineer, draft a technical specification for an MVP that addresses the primary user story. Include a proposed JSON API structure. Output: MVP_Spec.json and API_Endpoints.md.",
        task_type: 'code',
        priority: 92,
        status: 'todo',
        metadata: { squad: 'GAMMA', required_artifacts: ['MVP_Spec.json', 'API_Endpoints.md'] }
    },
    {
        title: "[SPRINT 0] [CHESED] Growth Hack: Early Adopter Magnet Strategy",
        description: "As the Growth Hacker, design a lead magnet (e.g., a whitelist or free tool) to capture the first 100 emails of people interested in the #1 opportunity. Output: Growth_Strategy.md and Viral_Coefficient_Projections.csv.",
        task_type: 'strategy',
        priority: 90,
        status: 'todo',
        metadata: { squad: 'BETA', required_artifacts: ['Growth_Strategy.md', 'Viral_Coefficient_Projections.csv'] }
    },
    {
        title: "[SPRINT 0] [SOPHIA] B2B Pricing Model & Go-To-Market Performa",
        description: "As the Business Developer, draft a 3-tier pricing model for the MVP and a Go-To-Market performa for the first 6 months. Output: Pricing_Model.csv and GTM_Roadmap.md.",
        task_type: 'business',
        priority: 88,
        status: 'todo',
        metadata: { squad: 'GAMMA', required_artifacts: ['Pricing_Model.csv', 'GTM_Roadmap.md'] }
    },
    {
        title: "[SPRINT 0] [TORCH] Social Media Viral Thread Concept",
        description: "As the Social Media Expert, draft a high-engagement Twitter/X thread concept that positions Trinity Symphony as the solution to the #1 Market Gap. Output: Viral_Thread_Concept.md.",
        task_type: 'content',
        priority: 85,
        status: 'todo',
        metadata: { squad: 'ALPHA', required_artifacts: ['Viral_Thread_Concept.md'] }
    }
];

async function seedSprint0() {
    console.log('--- SEEDING SPRINT 0: MARKET DISCOVERY ---');

    const { error } = await supabase.from('trinity_tasks').insert(sprint0Tasks);

    if (error) {
        console.error('Seeding error:', error.message);
        return;
    }

    console.log('✅ Successfully seeded Sprint 0: 6 strategic deliverables missions.');
}

seedSprint0();
