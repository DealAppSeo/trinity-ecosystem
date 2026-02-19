
import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load ENV
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

const compTasks = [
    {
        title: "[STARTUP WEEKEND] Autonomous Pitch: Business Developer (SOPHIA)",
        description: "Pitch one high-value 'Painkiller' idea for 2026. Focus on Executive ROI. Must build on recent market gap research. Output: Pitch_Proposal_Sophia.json",
        task_type: 'strategy',
        priority: 1500,
        status: 'todo',
        metadata: { squad: 'GAMMA', required_artifacts: ['Pitch_Proposal_Sophia.json'] }
    },
    {
        title: "[STARTUP WEEKEND] Autonomous Pitch: Growth Hacker (CHESED)",
        description: "Pitch one high-value 'Painkiller' idea for 2026. Focus on viral coefficient and traction. Output: Pitch_Proposal_Chesed.json",
        task_type: 'strategy',
        priority: 1500,
        status: 'todo',
        metadata: { squad: 'BETA', required_artifacts: ['Pitch_Proposal_Chesed.json'] }
    },
    {
        title: "[STARTUP WEEKEND] Autonomous Pitch: CTO (HDM)",
        description: "Pitch one high-value 'Painkiller' idea for 2026. Focus on technical moats and arbitrage efficiency. Output: Pitch_Proposal_HDM.json",
        task_type: 'strategy',
        priority: 1500,
        status: 'todo',
        metadata: { squad: 'GAMMA', required_artifacts: ['Pitch_Proposal_HDM.json'] }
    },
    {
        title: "[STARTUP WEEKEND] Peer Review & Top 3 Selection",
        description: "As the Architect (SOPHIA/ORCH), review all pitches. Rate them on: 1. Speed to Revenue, 2. Technical Feasibility, 3. Painkiller Score. Select the Top 3. Output: Top_3_Selection.json",
        task_type: 'audit',
        priority: 1400,
        status: 'todo',
        metadata: { squad: 'ORCHESTRATION', required_artifacts: ['Top_3_Selection.json'] }
    },
    {
        title: "[MORNING DEADLINE] Final Synthesis: Top 3 Pitch Decks & Mockups",
        description: "Based on Top_3_Selection.json, generate 3 full Pitch Decks, 3 PWA/JSON Mockups, and 3 Cost Performas. ROLE: Full Swarm. Output: Pitch_Decks_Final.md, Mockups.json, Performa_Symphony.csv",
        task_type: 'business',
        priority: 1300,
        status: 'todo',
        metadata: { squad: 'ALPHA', required_artifacts: ['Pitch_Decks_Final.md', 'Mockups.json', 'Performa_Symphony.csv'] }
    }
];

async function seedPitchComp() {
    console.log('--- SEEDING STARTUP WEEKEND: PITCK COMPETITION ---');

    // Clear existing morning deadline tasks to make room for autonomous ones
    await supabase.from('trinity_tasks').delete().like('title', '%[MORNING DEADLINE]%');

    const { error } = await supabase.from('trinity_tasks').insert(compTasks);

    if (error) {
        console.error('Seeding error:', error.message);
        return;
    }

    console.log('✅ Successfully seeded Autonomous Pitch Competition.');
}

seedPitchComp();
