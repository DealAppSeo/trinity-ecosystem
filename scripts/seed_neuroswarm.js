
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qnnpjhlxljtqyigedwkb.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing credentials");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const TASKS = [
    {
        title: "[Genesis] Ideation: NeuroSwarm Concepts",
        description: "Brainstorm 10 product ideas at the intersection of AI, Web3, and ANFIS/GNNs. Focus on 'Adaptive Swarms'. Output a markdown list.",
        task_type: "reasoning",
        assigned_to: "trinity-cdo",
        priority: 100
    },
    {
        title: "[Genesis] Pitch Drafting",
        description: "Select the top 3 concepts from Ideation. Write a 2-sentence 'Elevator Pitch' for each, creating a clear value prop for a decentralized audience.",
        task_type: "content",
        assigned_to: "trinity-cdo",
        priority: 95
    },
    {
        title: "[Genesis] Innovation: Hybrid Models",
        description: "Research and describe 3 specific use cases for integrating ANFIS (Fuzzy Logic) with GNNs (Graph Neural Networks) in a Web3 context.",
        task_type: "research",
        assigned_to: "trinity-science",
        priority: 95
    }
];

async function run() {
    console.log("Igniting Genesis (JS Mode)...");
    for (const t of TASKS) {
        const { error } = await supabase.from('trinity_tasks').insert({
            ...t,
            status: 'pending',
            created_at: new Date().toISOString(),
            requires_external_artifact: true,
            metadata: { tags: ['genesis', 'neuroswarm'] }
        });
        if (error) console.error("Error:", error.message);
        else console.log("Queued:", t.title);
    }
}

run();
