
import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load ENV
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

const highValueMissions = [
    {
        title: "[STRATEGY] Blue Ocean Analysis: AI-Native Agent Ecosystems",
        description: "Research 2026 market gaps for autonomous agent swarms in Web3. Identify 'Blue Ocean' opportunities where competitors are absent. Output: Market_Gap_Matrix.md and Blue_Ocean_Strategy.json",
        task_type: 'research',
        priority: 100,
        status: 'todo',
        metadata: { squad: 'BETA', required_artifacts: ['Market_Gap_Matrix.md', 'Blue_Ocean_Strategy.json'] }
    },
    {
        title: "[BUSINESS] Trinity Symphony SWOT & Competitor Performer Analysis",
        description: "Perform a SWOT analysis of Trinity Symphony vs. AutoGPT and BabyAGI. include a 'Performa' spreadsheet of estimated cost-savings using our Free-Tier Arbitrage vs. standard API billing. Output: SWOT_Analysis.md and Cost_Savings_Performa.csv",
        task_type: 'report',
        priority: 95,
        status: 'todo',
        metadata: { squad: 'ALPHA', required_artifacts: ['SWOT_Analysis.md', 'Cost_Savings_Performa.csv'] }
    },
    {
        title: "[IP] Provisional Patent Draft: Multi-Provider LLM Arbitrage Layer",
        description: "Draft the technical claims for our system that dynamically routes tasks between providers based on latency and cost. Focus on the ANFIS integration. Output: Provisional_Patent_Draft.md",
        task_type: 'content',
        priority: 98,
        status: 'todo',
        metadata: { squad: 'GAMMA', required_artifacts: ['Provisional_Patent_Draft.md'] }
    },
    {
        title: "[UX] User Story & Flow Chart: Voice-First PWA Onboarding",
        description: "Create a Mermaid flow chart for the voice-first onboarding mentioned in our tech strategy. Map out the transition from Telegram to the PWA. Output: User_Flow_Onboarding.md",
        task_type: 'design',
        priority: 92,
        status: 'todo',
        metadata: { squad: 'BETA', required_artifacts: ['User_Flow_Onboarding.md'] }
    },
    {
        title: "[MVP] Feature Specification: Agent 'Manager Mode' Dashboard",
        description: "Draft JSON and HTML/CSS mockups for a 'Manager Mode' dashboard component where users can see agent tool orchestration in real-time. Output: Manager_Dashboard_Spec.json, mockup.html",
        task_type: 'design',
        priority: 88,
        status: 'todo',
        metadata: { squad: 'ALPHA', required_artifacts: ['Manager_Dashboard_Spec.json', 'mockup.html'] }
    },
    {
        title: "[GROWTH] Viral Waitlist & Early Adopter Incentive Logic",
        description: "Design a referral system logic (Web3 based) for an early adopter waitlist. Document the smart contract requirements and viral coefficient projections. Output: Viral_Waitlist_Strategy.md",
        task_type: 'research',
        priority: 90,
        status: 'todo',
        metadata: { squad: 'GAMMA', required_artifacts: ['Viral_Waitlist_Strategy.md'] }
    }
];

async function seedHighValueTasks() {
    console.log('--- SEEDING HIGH-VALUE BUSINESS MISSIONS ---');

    const { error } = await supabase.from('trinity_tasks').insert(highValueMissions);

    if (error) {
        console.error('Seeding error:', error.message);
        return;
    }

    console.log('✅ Successfully seeded 6 strategic assets missions.');
}

seedHighValueTasks();
