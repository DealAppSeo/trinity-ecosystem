
import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load ENV
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

const consensusTasks = [
    {
        title: "[STARTUP WEEKEND] Swarm Consensus: The All-In Pivot",
        description: "Review all pitched ideas [Pitch_Proposal]. Evaluate if one dominant 'Painkiller' idea exists that merits the entire swarm's focus. If not, proceed with the Top 3. If yes, issue a 'Consensus Pivot' directive for all agents to focus on the winner. Output: Consensus_Report.json",
        task_type: 'audit',
        priority: 1450,
        status: 'todo',
        metadata: { squad: 'ORCHESTRATION', required_artifacts: ['Consensus_Report.json'] }
    },
    {
        title: "[MORNING DEADLINE] Final Synthesis: Selected MVP Deliverables",
        description: "Generate the Pitch Decks, Mockups, and Prototypes for the winner(s) selected in Consensus_Report.json. If the swarm went 'All-In', produce a higher-fidelity prototype. ROLE: Full Swarm. Output: Pitch_Decks_Final.md, Mockups.json, Performa_Symphony.csv",
        task_type: 'business',
        priority: 1300,
        status: 'todo',
        metadata: { squad: 'ALPHA', required_artifacts: ['Pitch_Decks_Final.md', 'Mockups.json', 'Performa_Symphony.csv'] }
    }
];

async function seedConsensus() {
    console.log('--- REFINING STARTUP WEEKEND: ENABLING CONSENSUS ---');

    // Clear the generic "Final Synthesis" task if it exists to replace with this one
    await supabase.from('trinity_tasks').delete().like('title', '%Final Synthesis: Top 3 Pitch Decks%');

    const { error } = await supabase.from('trinity_tasks').insert(consensusTasks);

    if (error) {
        console.error('Seeding error:', error.message);
        return;
    }

    console.log('✅ Successfully enabled Swarm Consensus logic.');
}

seedConsensus();
