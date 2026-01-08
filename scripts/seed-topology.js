const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Load Env
const envPath = path.resolve(__dirname, '../.env.local');
dotenv.config({ path: envPath });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌ Missing Credentials");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const topology = [
    // ORCHESTRATION LAYER (The 3 Managers)
    { agent_id: 'MANAGER_ROUTER', role: 'ORCHESTRATOR', status: 'ACTIVE', current_task: 'Monitoring Signal Traffic' },
    { agent_id: 'MANAGER_HITL', role: 'ORCHESTRATOR', status: 'IDLE', current_task: 'Waiting for Escalation' },
    { agent_id: 'MANAGER_REPUTATION', role: 'ORCHESTRATOR', status: 'ACTIVE', current_task: 'Verifying ZKP Proofs' },

    // GROK POD (Market / Viral)
    { agent_id: 'GROK_CMO_TREND', role: 'CMO', status: 'ACTIVE', current_task: 'Scanning X API' },
    { agent_id: 'GROK_CMO_CONTENT', role: 'CMO', status: 'IDLE', current_task: null },
    { agent_id: 'GROK_CMO_CAMPAIGN', role: 'CMO', status: 'IDLE', current_task: null },

    // CLAUDE POD (UI / UX / Code)
    { agent_id: 'CLAUDE_CDO_DESIGN', role: 'CDO', status: 'ACTIVE', current_task: 'Refining Glassmorphism' },
    { agent_id: 'CLAUDE_CDO_FLOW', role: 'CDO', status: 'IDLE', current_task: null },
    { agent_id: 'CLAUDE_CDO_PROTO', role: 'CDO', status: 'IDLE', current_task: null },

    // GEMINI POD (Security / Infra)
    { agent_id: 'GEMINI_CTO_PROOF', role: 'CTO', status: 'ACTIVE', current_task: 'Generating Plonky3 Proofs' },
    { agent_id: 'GEMINI_CTO_SCHEMA', role: 'CTO', status: 'IDLE', current_task: null },
    { agent_id: 'GEMINI_CTO_AUDIT', role: 'CTO', status: 'IDLE', current_task: null },
];

async function seed() {
    console.log("🌱 Seeding 3x3 + 3 Topology into Sandbox DB...");

    for (const agent of topology) {
        const payload = {
            agent_id: agent.agent_id,
            status: agent.status,
            current_task: agent.current_task,
            memory: { role: agent.role, seed: true },
            updated_at: new Date().toISOString()
        };

        const { error } = await supabase
            .from('sandbox_agent_state')
            .insert([payload])
            .select();

        if (error) console.error(`❌ Failed to seed ${agent.agent_id}:`, error.message);
        else console.log(`✅ Seeded ${agent.agent_id}`);
    }
    console.log("🏁 Toplogy Seeding Complete.");
}

seed();
