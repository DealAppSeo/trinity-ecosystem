const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: 'c:/Users/Cash4/OneDrive/Desktop/trinity-ecosystem/trinity-ecosystem/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const tasksToSeed = [
    { title: 'Seed and test arbitrage opportunity pipeline', description: 'Query arbitrage_opportunities and opportunities tables. Verify rows are being written automatically or seed 10 test opportunities across different sectors and providers. Confirm the pipeline from ANFIS routing decision to opportunity logging is connected. Report how many opportunities were auto-discovered vs manually seeded.', assigned_to: 'trinity-torch', status: 'todo', priority: 85, task_type: 'investigation', is_real: true, is_evergreen: false },
    { title: 'Audit anfis_decisions table completeness', description: 'Query anfis_decisions for last 7 days. Report: total decisions, unique providers selected, avg quality_score, avg cost_selected, avg cost_alternative, avg arbitrage delta. Identify which providers have never been selected. Identify the single highest-value arbitrage opportunity currently visible. Report findings as structured data.', assigned_to: 'trinity-chesed', status: 'todo', priority: 85, task_type: 'audit', is_real: true, is_evergreen: false },
    { title: 'Investigate and fix task queue starvation', description: 'Several agents are completing 0 tasks despite being online. Specifically trinity-shofet, trinity-apm, trinity-gcm have fewer than 5 completed tasks despite weeks of runtime. Diagnose whether this is caused by: no tasks matching their tier, ZKP gate blocking execution, task type filtering, or queue polling logic. Fix the root cause and seed 3 appropriate tasks for each starved agent.', assigned_to: 'trinity-shofet', status: 'todo', priority: 90, task_type: 'investigation', is_real: true, is_evergreen: false },
    { title: 'Map and document all evergreen task definitions', description: 'Query trinity_tasks WHERE is_evergreen = true. List all recurring tasks, their assigned agents, recurring_minutes interval, last_spawned_at, and spawned_count. Identify any evergreen tasks that have never spawned or stopped spawning. Report which agents have no evergreen tasks assigned — these agents have no autonomous work when the todo queue is empty.', assigned_to: 'trinity-orch', status: 'todo', priority: 75, task_type: 'audit', is_real: true, is_evergreen: false },
    { title: 'Verify and test Alpaca paper trading end to end', description: 'Execute a test paper trade via the Telegram /trade command. Verify the order appears in Alpaca paper account. Query trinity_tasks for any trading-related tasks and confirm actual_cost is being logged for trading operations. Report current paper portfolio: buying power, equity, open positions, and P&L since integration.', assigned_to: 'trinity-w3c', status: 'todo', priority: 75, task_type: 'verification', is_real: true, is_evergreen: false },
    { title: 'Audit agent squad coordination and task handoffs', description: 'Verify that inter-squad task handoffs are working correctly between ALPHA (Veritas, GCM, Torch), BETA (Mel, APM, Chesed), and GAMMA (HDM, Nexus, Sophia) squads. Find any task that was assigned to one squad agent and handed to another. If no handoffs exist, seed one cross-squad coordination task and verify it completes. Report coordination health.', assigned_to: 'trinity-gcm', status: 'todo', priority: 70, task_type: 'audit', is_real: true, is_evergreen: false },
    { title: 'Generate system health baseline report', description: 'Compile a comprehensive health report covering: (1) all agent RepIDs and task counts, (2) ANFIS arbitrage delta trend over last 7 days, (3) peer verification rate, (4) task completion rate by status, (5) cost tracking coverage percentage, (6) top 3 most active agents, (7) top 3 least active agents with diagnosis. Save as proof_of_work on this task.', assigned_to: 'trinity-apm', status: 'todo', priority: 80, task_type: 'report', is_real: true, is_evergreen: false },
    { title: 'Test and verify Telegram HITL hunch taxonomy', description: 'Trigger a HITL interaction via Telegram. Verify the 8-category hunch taxonomy prompt appears. Submit a test hunch with category and confidence score. Verify the entry appears in hitl_hunch_log with correct patent metadata tags. Report the current count of hunch log entries and the distribution across the 8 categories.', assigned_to: 'trinity-sophia', status: 'todo', priority: 70, task_type: 'verification', is_real: true, is_evergreen: false }
];

async function seed() {
    console.log("🌱 Seeding Batch 2 tasks...");
    const { data, error } = await supabase.from('trinity_tasks').insert(tasksToSeed).select();
    if (error) {
        console.error("❌ Seeding failed:", error.message);
    } else {
        console.log(`✅ ${data.length} tasks seeded successfully.`);
    }
}

seed();
