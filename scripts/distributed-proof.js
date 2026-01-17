/**
 * TRINITY DISTRIBUTED SYSTEM PROOF
 * Seeds a variety of specialized tasks to prove the swarm is fully operational.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function runDistributedProof() {
    console.log('\n--- [TRINITY 🚀 DISTRIBUTED SYSTEM PROOF] ---');
    console.log('Objective: Prove all agents are active and capable of processing specialized tasks.\n');

    const demoId = `PROOF-${Date.now().toString().slice(-4)}`;

    const tasks = [
        {
            title: `[GCM] Constitutional Ethics Audit (${demoId})`,
            description: "Review recent swarm logs for adherence to the 8 virtues (Philippians 4:8).",
            task_type: 'meta',
            assigned_to: 'trinity-gcm',
            status: 'pending',
            priority: 1000,
            is_real: true
        },
        {
            title: `[MEL] Dashboard UX Improvements (${demoId})`,
            description: "Design a new widget for real-time reputation visualization.",
            task_type: 'design',
            assigned_to: 'trinity-mel',
            status: 'pending',
            priority: 999,
            is_real: true
        },
        {
            title: `[HDM] Infrastructure Stress Analysis (${demoId})`,
            description: "Evaluate the database performance under a 12-agent simultaneous load.",
            task_type: 'code',
            assigned_to: 'trinity-hdm',
            status: 'pending',
            priority: 998,
            is_real: true
        },
        {
            title: `[W3C] DeFi Market Sentiment Analysis (${demoId})`,
            description: "Analyze recent market trends using AlphaVantage and report opportunities.",
            task_type: 'research',
            assigned_to: 'trinity-w3c',
            status: 'pending',
            priority: 997,
            is_real: true
        },
        {
            title: `[APM] Daily Spiritual Reflection (${demoId})`,
            description: "Draft a message of encouragement for the developers and agents.",
            task_type: 'content',
            assigned_to: 'trinity-apm',
            status: 'pending',
            priority: 996,
            is_real: true
        }
    ];

    console.log(`[SEEDING] 🔨 Injecting ${tasks.length} specialized tasks...`);
    const { data: insertedTasks, error: seedError } = await supabase
        .from('trinity_tasks')
        .insert(tasks)
        .select();

    if (seedError) {
        console.error('❌ SEEDING FAILED:', seedError.message);
        return;
    }

    console.log('\n✅ DISTRIBUTED TASKS SEEDED SUCCESSFULLY.');
    console.log('Instructions:');
    console.log('1. Run `node scripts/swarm-boot.js` to activate the full swarm.');
    console.log('2. Watch the Dashboard "Agents" page for green dots.');
    console.log('3. Refresh the Tasks page to see all agents claiming their specific "In Progress" missions.');
    console.log('\n--- [PROOF READY] ---');
}

runDistributedProof();
