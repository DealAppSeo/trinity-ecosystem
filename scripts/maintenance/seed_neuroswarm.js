
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
    // 1. 🌱 SEED PHASE: IDEATION
    {
        title: "[Genesis] 1.1: Brainstorm NeuroSwarm Concepts",
        description: `OBJECTIVE: Brainstorm 10 product ideas for 'NeuroSwarm' (AI Swarm + Web3).
        
INSTRUCTIONS:
1. Use your EYES (tavily_search) to explore 'ANFIS applications in Web3' and 'GNN use cases in Blockchain'.
2. Use your HANDS (write_file) to save the list to: 'artifacts/NeuroSwarm/01_Ideation/01_concept_list.md'.
3. The content must include: Concept Name, One-Liner, and 'Why Now?'.`,
        task_type: "reasoning",
        assigned_to: "trinity-cdo",
        priority: 100
    },
    {
        title: "[Genesis] 1.2: Select Top 3 & Pitch",
        description: `OBJECTIVE: Select the top 3 concepts from Step 1.1 and write elevator pitches.

INSTRUCTIONS:
1. Read the file 'artifacts/NeuroSwarm/01_Ideation/01_concept_list.md' (if it exists) or regenerate ideas.
2. Write a 2-sentence pitch for the Top 3.
3. SAVE to: 'artifacts/NeuroSwarm/01_Ideation/02_top_pitches.md'.`,
        task_type: "content",
        assigned_to: "trinity-cdo",
        priority: 95
    },

    // 2. 🌿 SPROUT PHASE: VALIDATION & RESEARCH
    {
        title: "[Genesis] 2.1: Market Opportunity Research",
        description: `OBJECTIVE: Quantify the market size for Decentralized AI.

INSTRUCTIONS:
1. SEARCH for 'Web3 AI Market Size 2025' and 'Decentralized Agent Market Cap'.
2. SYNTHESIZE data from at least 3 sources (e.g., Gartner, Messari, VanEck).
3. SAVE a Report to: 'artifacts/NeuroSwarm/02_Research/01_market_report.md'.`,
        task_type: "research",
        assigned_to: "trinity-science",
        priority: 95
    },
    {
        title: "[Genesis] 2.2: Competitor Recon (Ocean & Bittensor)",
        description: `OBJECTIVE: Analyze competitors to find our 'Unfair Advantage'.

INSTRUCTIONS:
1. RESEARCH 'Ocean Protocol' and 'Bittensor' architecture.
2. COMPARE them to NeuroSwarm (ANFIS-based).
3. SAVE a Comparison Matrix to: 'artifacts/NeuroSwarm/02_Research/02_competitor_matrix.md'.`,
        task_type: "research",
        assigned_to: "trinity-science",
        priority: 90
    },

    // 3. 🪴 SEEDLING PHASE: PLANNING
    {
        title: "[Genesis] 3.1: Architecture Diagram (Text)",
        description: `OBJECTIVE: Design the High-Level System Architecture.

INSTRUCTIONS:
1. DESIGN a topology where Agents (Nodes) communicate via a GNN (Graph Neural Network).
2. USE Mermaid.js syntax to visualize the flow.
3. SAVE the text-based diagram to: 'artifacts/NeuroSwarm/03_Planning/01_architecture_diagram.md'.`,
        task_type: "code",
        assigned_to: "trinity-veritas",
        priority: 90
    },
    {
        title: "[Genesis] 3.2: User Stories & Persona",
        description: `OBJECTIVE: Define who uses NeuroSwarm.

INSTRUCTIONS:
1. CREATE 3 Personas: 'The DeFi Trader', 'The DAO Governor', 'The Data Scientist'.
2. WRITE 5 User Stories for each (e.g., 'As a Trader, I want predictive pricing...').
3. SAVE to: 'artifacts/NeuroSwarm/03_Planning/02_user_stories.md'.`,
        task_type: "content",
        assigned_to: "trinity-cdo",
        priority: 85
    },

    // 4. 🌳 SAPLING PHASE: PROTOTYPING
    {
        title: "[Genesis] 4.1: ANFIS Logic Mockup (Python)",
        description: `OBJECTIVE: Create a POC for the Adaptive Pricing Engine.

INSTRUCTIONS:
1. WRITE a Python script (concept only) using 'scikit-fuzzy' logic.
2. DEFINE fuzzy rules (e.g., 'If Volatility is High AND Liquidity is Low THEN Fee is High').
3. SAVE code to: 'artifacts/NeuroSwarm/04_Prototyping/01_anfis_pricing.py'.`,
        task_type: "code",
        assigned_to: "trinity-veritas",
        priority: 85
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
