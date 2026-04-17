
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: 'c:/Users/Cash4/OneDrive/Desktop/trinity-ecosystem/trinity-ecosystem/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const phase0Tasks = [
    { title: 'Verify Upper-Case Agent ID Trigger', description: 'Confirm that the Supabase trigger enforcing uppercase agent IDs is functional. Insert a lowercase ID and verify it auto-converts to uppercase.', assigned_to: 'VERITAS', status: 'todo', priority: 95, task_type: 'verification', is_real: true },
    { title: 'Audit retrieval_logs table structure', description: 'Collaborate with HDM to verify the schema for the upcoming retrieval_logs table. Ensure it supports ANFIS routing metadata.', assigned_to: 'APM', status: 'todo', priority: 85, task_type: 'investigation', is_real: true },
    { title: 'Prepare SQL for dag_nodes and dag_edges', description: 'Draft the SQL migrations for the Semantic DAG tables. Ensure primary keys are BIGINT and compatible with Merkle hashing.', assigned_to: 'HDM', status: 'todo', priority: 90, task_type: 'build', is_real: true },
    { title: 'Test Merkle util logic', description: 'Implement a prototype of the sha2-256 Merkle hash utility. Verify it correctly hashes nested artifact objects.', assigned_to: 'CHESED', status: 'todo', priority: 80, task_type: 'build', is_real: true },
    { title: 'Draft eBPF telemetry spec', description: 'Research bcc-tools for monitoring Dragonfly (6379) and Supabase (5432). Define the p50/p95/p99 aggregation window.', assigned_to: 'APM', status: 'todo', priority: 88, task_type: 'investigation', is_real: true },
    { title: 'Subdomain Routing Audit', description: 'Map out the current Railway subdomains for all 12 agents. Ensure CORS and SSL are correctly configured for cross-agent communication.', assigned_to: 'NEXUS', status: 'todo', priority: 82, task_type: 'investigation', is_real: true },
    { title: 'Strategy Framework Optimization', description: 'Analyze the current 47-day production logs. Propose membership function bounds for the initial db_tier_selector.', assigned_to: 'SOPHIA', status: 'todo', priority: 87, task_type: 'investigation', is_real: true },
    { title: 'ERC-8004 Registry Setup', description: 'Prepare the deployment script for TrinityIdentityAdapter.sol. Verify compatibility with Base Sepolia testnet.', assigned_to: 'W3C', status: 'todo', priority: 90, task_type: 'build', is_real: true },
    { title: 'Quorum Governance DDL draft', description: 'Define the voting logic for the BFT schema governance. Draft the internal message format for change_proposals.', assigned_to: 'ORCH', status: 'todo', priority: 92, task_type: 'design', is_real: true },
    { title: 'Final DDL Arbiter logic', description: 'Design the fallback arbitration logic for contested votes. Integrate the Pythagorean Comma Veto parameters.', assigned_to: 'SHOFET', status: 'todo', priority: 80, task_type: 'design', is_real: true },
    { title: 'Arbitrage Delta Baseline', description: 'Calculate the baseline arbitrage delta for the last 7 days. Use this to seed the RepID weighted proof logic.', assigned_to: 'TORCH', status: 'todo', priority: 85, task_type: 'investigation', is_real: true },
    { title: 'Faith Mentorship Contextualization', description: 'Ensure all new automated tasks are filtered through the Trinity Symphony constitution (Philippians 4:8). Audit the system ethics.', assigned_to: 'MEL', status: 'todo', priority: 95, task_type: 'verification', is_real: true }
];

async function seedTasks() {
    console.log("🚀 Seeding Phase 0 Integrity Tasks...");

    const { data, error } = await supabase.from('trinity_tasks').insert(phase0Tasks).select();

    if (error) {
        console.error("❌ Seeding failed:", error.message);
    } else {
        console.log(`✅ ${data.length} Phase 0 tasks seeded.`);
    }
}

seedTasks();
