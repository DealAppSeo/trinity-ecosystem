
import { supabase } from '../lib/supabase';

async function injectTestTasks() {
    console.log("🚀 Injecting Proof-of-Work Tasks...");

    const tasks = [
        // --- LEVEL 1: EASY (File Creation & Simple Logic) ---
        {
            title: '[TEST: EASY] Create Greeting File',
            description: 'Start simple. Use the FileSystem tool to create a file named `artifacts/proofs/greeting.txt`. The content should be a single sentence: "Hello from the Trinity Swarm, proving capabilities." Then read it back to confirm.',
            priority: 5,
            agent_assigned: 'trinity-mel', // Care Squad
            task_type: 'verification'
        },
        {
            title: '[TEST: EASY] List Root Artifacts',
            description: 'Use the `list_files` tool to look at the `artifacts` directory. Create a new file `artifacts/proofs/file_list.md` that lists the names of all files you see.',
            priority: 5,
            agent_assigned: 'trinity-veritas', // Truth Squad
            task_type: 'verification'
        },
        {
            title: '[TEST: EASY] Simple Math Fact',
            description: 'Create a file `artifacts/proofs/math_fact.json`. Content should be valid JSON: `{"pi": 3.14159, "agent": "trinity-hdm", "status": "active"}`.',
            priority: 5,
            agent_assigned: 'trinity-hdm', // Build Squad
            task_type: 'verification'
        },

        // --- LEVEL 2: MEDIUM (Research & Reasoning) ---
        {
            title: '[TEST: MEDIUM] Analyze AI Ethics',
            description: 'Write a 2-paragraph reflection on "Asimov\'s Laws in the Age of LLMs". Save this as a markdown file: `artifacts/proofs/ethics_reflection.md`. Use bold text for key arguments.',
            priority: 8,
            agent_assigned: 'trinity-mel',
            task_type: 'research'
        },
        {
            title: '[TEST: MEDIUM] Truth Verification Plan',
            description: 'Create a strategy document `artifacts/proofs/truth_strategy.md`. Outline 3 steps you would take to verify a fake news article. Use a numbered list format.',
            priority: 8,
            agent_assigned: 'trinity-veritas',
            task_type: 'strategy'
        },
        {
            title: '[TEST: MEDIUM] System Optimization Log',
            description: 'Create a log file `artifacts/proofs/optimization_log.csv`. Header: `Timestamp,Metric,Value`. Add 3 mock rows of data regarding CPU usage and Memory.',
            priority: 8,
            agent_assigned: 'trinity-hdm',
            task_type: 'data'
        },

        // --- LEVEL 3: HARD (Complex Generation & Structure) ---
        {
            title: '[TEST: HARD] Design Emotional Health Dashboard',
            description: 'Create a complete HTML file `artifacts/proofs/health_dashboard.html`. It must include: 1. A dark-mode CSS style block. 2. A "Mood-O-Meter" visual component (using CSS/divs). 3. A list of "Daily Affirmations". This should look suitable for a UI.',
            priority: 10,
            agent_assigned: 'trinity-mel',
            task_type: 'design'
        },
        {
            title: '[TEST: HARD] Write a Python Analysis Script',
            description: 'Create a Python script file `artifacts/proofs/analyze_data.py`. The script should define a function `calculate_growth(current, previous)` and print the percentage increase. Include detailed comments explaining the code.',
            priority: 10,
            agent_assigned: 'trinity-veritas',
            task_type: 'coding'
        },
        {
            title: '[TEST: HARD] Generate SQL Schema for User Profiles',
            description: 'Create a SQL file `artifacts/proofs/users_schema.sql`. Define a `users` table with UUID id, email, password_hash, and jsonb profile. Add an Index on email and a comment explaining the schema choice.',
            priority: 10,
            agent_assigned: 'trinity-hdm',
            task_type: 'coding'
        }
    ];

    for (const task of tasks) {
        const { error } = await supabase.from('trinity_tasks').insert({
            ...task,
            status: 'pending',
            created_at: new Date().toISOString(),
            agent_assigned: task.agent_assigned || null
        });

        if (error) console.error(`❌ Failed to inject "${task.title}":`, error.message);
        else console.log(`✅ Injected: ${task.title}`);
    }

    console.log("\nDone! Please check the Controller UI Task Queue.");
}

injectTestTasks();
