const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: 'c:/Users/Cash4/OneDrive/Desktop/trinity-ecosystem/trinity-ecosystem/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const tasksToSeed = [
    {
        title: 'Create retrieval_logs table for ANFIS observability',
        description: 'Implement the schema for retrieval_logs as defined in the Web3 Edge Architecture doc. This includes artifact_id, query_text, tier_used (1-3), nodes_traversed (JSONB), latency_ms, cost_units, and anfis_scores. This is critical for auditing ANFIS tier routing.',
        assigned_to: 'trinity-hdm',
        status: 'todo',
        priority: 98,
        task_type: 'code',
        is_real: true
    },
    {
        title: 'Implement Merkle hash computation for agent artifacts',
        description: 'Create utils/merkle.js and integrate sha2-256 multihash computation into the artifact write path. Every new artifact must have its hash stored in a new hash column in agent_artifacts. This ensures tamper-evidence and DAG integrity.',
        assigned_to: 'trinity-chesed',
        status: 'todo',
        priority: 95,
        task_type: 'code',
        is_real: true
    },
    {
        title: 'Initialize Semantic DAG schema (dag_edges & dag_nodes)',
        description: 'Create dag_edges and dag_nodes tables to support relational artifact connections (evidence_for, contradicts, refines). Ensure foreign key relationships to agent_artifacts and implement basic graph traversal functions in SQL.',
        assigned_to: 'trinity-hdm',
        status: 'todo',
        priority: 95,
        task_type: 'code',
        is_real: true
    }
];

async function seed() {
    console.log("🌱 Seeding Web3 Phase 1 Foundation tasks...");
    const { data, error } = await supabase.from('trinity_tasks').insert(tasksToSeed).select();
    if (error) {
        console.error("❌ Seeding failed:", error.message);
    } else {
        console.log(`✅ ${data.length} tasks seeded successfully.`);
    }
}

seed();
