const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: 'c:/Users/Cash4/OneDrive/Desktop/trinity-ecosystem/trinity-ecosystem/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const tasksToSeed = [
    {
        title: 'Build & Test constitutional-agent-base.js v8.2.0',
        description: 'Formally build and test the v8.2.0 agent base with reflectOnResult() codified. Ensure the Plan-Execute-Reflect-Verify loop works end-to-end before patching all agents.',
        assigned_to: 'ORCH',
        status: 'todo',
        priority: 100,
        task_type: 'code',
        is_real: true
    },
    {
        title: 'Create retrieval_logs table for ANFIS observability',
        description: 'Create retrieval_logs table in public schema: id (BIGSERIAL), agent_id (TEXT), query (TEXT), routed_tier (TEXT), confidence (FLOAT), latency_ms (INT), created_at (TIMESTAMPTZ).',
        assigned_to: 'HDM',
        status: 'todo',
        priority: 98,
        task_type: 'code',
        is_real: true
    },
    {
        title: 'Create agent_task_plans table for MLAgentBench loop',
        description: 'Create agent_task_plans table in public schema: id (BIGSERIAL), agent_id (TEXT), task_id (BIGINT), plan_json (JSONB), created_at (TIMESTAMPTZ). Required for the "Plan" step of the new loop.',
        assigned_to: 'HDM',
        status: 'todo',
        priority: 98,
        task_type: 'code',
        is_real: true
    },
    {
        title: 'Create hitl_settings table for Mobile Dash prioritization',
        description: 'Create hitl_settings table in public schema: id (BIGSERIAL), user_id (TEXT), slider_value (TEXT), settings (JSONB), updated_at (TIMESTAMPTZ). Required for programmatic HITL control.',
        assigned_to: 'HDM',
        status: 'todo',
        priority: 98,
        task_type: 'code',
        is_real: true
    },
    {
        title: 'Initialize Semantic DAG schema (dag_edges & dag_nodes)',
        description: 'Create dag_edges and dag_nodes tables to support relational artifact connections. Ensure foreign key relationships to agent_artifacts.',
        assigned_to: 'HDM',
        status: 'todo',
        priority: 95,
        task_type: 'code',
        is_real: true
    },
    {
        title: 'Implement Merkle hash computation for agent artifacts',
        description: 'Create utils/merkle.js and integrate sha2-256 multihash computation into the artifact write path for tamper-evidence.',
        assigned_to: 'CHESED',
        status: 'todo',
        priority: 95,
        task_type: 'code',
        is_real: true
    }
];

async function seed() {
    console.log("🌱 Seeding Enhanced Web3 Phase 1 tasks...");
    const { data, error } = await supabase.from('trinity_tasks').insert(tasksToSeed).select();
    if (error) {
        console.error("❌ Seeding failed:", error.message);
    } else {
        console.log(`✅ ${data.length} tasks seeded successfully.`);
    }
}

seed();
