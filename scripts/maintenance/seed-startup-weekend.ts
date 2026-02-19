
import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load ENV
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

const startupWeekendMissions = [
    {
        title: "[STARTUP WEEKEND] Reverse Engineer 2025 Successes: Agentic AI x Web3 x Quantum",
        description: "As the Data Scientist (VERITAS), identify the top 3 startups of 2025 that dominated the Agentic AI and Web3 space. Analyze their revenue models and tech stacks. Output: Competitor_Insight_2025.json and Strategy_Reverse_Engineered.md.",
        task_type: 'research',
        priority: 110,
        status: 'todo',
        metadata: { squad: 'ALPHA', required_artifacts: ['Competitor_Insight_2025.json', 'Strategy_Reverse_Engineered.md'] }
    },
    {
        title: "[STARTUP WEEKEND] Identify 'Executive Painkillers': Time & Money Saving Gaps",
        description: "As the Business Developer (SOPHIA), research the top 3 biggest challenges and pain points of C-suite executives in 2026. Focus on areas where Agentic AI can save them significant time or money. Output: Exec_Pain_Point_Report.md and ROI_Opportunity_Matrix.csv.",
        task_type: 'business',
        priority: 105,
        status: 'todo',
        metadata: { squad: 'GAMMA', required_artifacts: ['Exec_Pain_Point_Report.md', 'ROI_Opportunity_Matrix.csv'] }
    },
    {
        title: "[STARTUP WEEKEND] Pitch New Idea: The 'Deep Executive Assistant' (AI x Web3)",
        description: "As a Startup Founder, draft a pitch for a new product that solves an executive pain point discovered by SOPHIA. Use the 'Painkiller vs Vitamin' framework. Output: Pitch_Deck_v1.md and Business_Model_Canvas.json.",
        task_type: 'strategy',
        priority: 100,
        status: 'todo',
        metadata: { squad: 'BETA', required_artifacts: ['Pitch_Deck_v1.md', 'Business_Model_Canvas.json'] }
    },
    {
        title: "[STARTUP WEEKEND] Peer Review & ROI Voting: Pitch Selection",
        description: "Review [STARTUP WEEKEND] Pitch artifacts. Rate them based on: 1. Speed to Market, 2. Potential for Paying Customers, 3. Funding Potential. Output: Voting_Results.json and Roadmap_Selection_Report.md.",
        task_type: 'audit',
        priority: 95,
        status: 'todo',
        metadata: { squad: 'ORCHESTRATION', required_artifacts: ['Voting_Results.json', 'Roadmap_Selection_Report.md'] }
    }
];

async function seedStartupWeekend() {
    console.log('--- SEEDING STARTUP WEEKEND: IDEATION & RESEARCH ---');

    const { error } = await supabase.from('trinity_tasks').insert(startupWeekendMissions);

    if (error) {
        console.error('Seeding error:', error.message);
        return;
    }

    console.log('✅ Successfully seeded 4 Startup Weekend strategic missions.');
}

seedStartupWeekend();
