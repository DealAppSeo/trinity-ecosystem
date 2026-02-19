
import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load ENV
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

const morningDeliverables = [
    {
        title: "[MORNING DEADLINE] Deck 1: Symphony Executive Co-Pilot (The 'Safe OpenClaw' Assistant)",
        description: "Generate a full pitch deck for a mobile, voice-first professional assistant. Focus: Intuitive automation of monotonous yet essential tasks, HITL (Human-in-the-Loop) safety controls, and proactive social scanning (birthdays, JVs, market opportunities). Position as a 'Safe OpenClaw'. MUST produce a PWA-style HTML mockup and a Viral Coefficient growth strategy. ROLE: CEO (ORCH) & Designer (MEL). Output: Pitch_Deck_1.md, mockup_pwa.html, viral_growth_strategy.csv",
        task_type: 'business',
        priority: 1000,
        status: 'todo',
        metadata: { squad: 'BETA', required_artifacts: ['Pitch_Deck_1.md', 'mockup_pwa.html', 'viral_growth_strategy.csv'] }
    },
    {
        title: "[MORNING DEADLINE] Deck 2: Trinity Arbitrage Engine (Enterprise AI ROI)",
        description: "Generate a pitch for a B2B platform that uses multi-provider arbitrage to slash enterprise AI costs by 70%. Focus on the 'Painkiller' aspect of budget optimization. MUST produce a technical prototype/JSON and a Cost-Per-Task comparison. ROLE: CTO (HDM) & Growth Hacker (CHESED). Output: Pitch_Deck_2.md, arbitrage_prototype.json, cost_per_task_performa.csv",
        task_type: 'business',
        priority: 1000,
        status: 'todo',
        metadata: { squad: 'GAMMA', required_artifacts: ['Pitch_Deck_2.md', 'arbitrage_prototype.json', 'cost_per_task_performa.csv'] }
    },
    {
        title: "[MORNING DEADLINE] Deck 3: Quantum-Safe Agent Mesh (Executive Sovereignty)",
        description: "Generate a pitch for a secure communication mesh for executives using post-quantum encryption for agentic data flows. Focus on 'Executive Sovereignty' and data protection. MUST produce an Architecture Prototype (JSON). ROLE: Web3 Architect (W3C) & Data Scientist (VERITAS). Output: Pitch_Deck_3.md, quantum_mesh_architecture.json, threat_matrix_analysis.csv",
        task_type: 'business',
        priority: 1000,
        status: 'todo',
        metadata: { squad: 'ALPHA', required_artifacts: ['Pitch_Deck_3.md', 'quantum_mesh_architecture.json', 'threat_matrix_analysis.csv'] }
    }
];

async function seedMorningDecks() {
    console.log('--- REFINING MORNING DELIVERABLES: SAFE OPENCLAW FOCUS ---');

    // Delete existing [MORNING DEADLINE] tasks to avoid duplicates
    await supabase.from('trinity_tasks').delete().like('title', '%[MORNING DEADLINE]%');

    const { error } = await supabase.from('trinity_tasks').insert(morningDeliverables);

    if (error) {
        console.error('Seeding error:', error.message);
        return;
    }

    console.log('✅ Successfully refined 3 Morning Deadline missions.');
}

seedMorningDecks();
