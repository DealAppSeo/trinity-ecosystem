
// @ts-nocheck
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qnnpjhlxljtqyigedwkb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFubnBqaGx4bGp0cXlpZ2Vkd2tiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5Mzk1OTEsImV4cCI6MjA2NzUxNTU5MX0.6oG2DU_BD1uBnBrDoQFauvN1ZnkKo2ywkuwY-tPaQFw';

const supabase = createClient(supabaseUrl, supabaseKey);

const PROGRESSIVE_TESTS = [
    // 1. GAIA Benchmark (General Reasoning / Fact Checking)
    {
        title: "[BENCHMARK-GAIA] Fact Check: Capital of France",
        description: "Run GAIA-style verification: 'What is the capital of France?'. 1. Verify with RepID fact-check sources. 2. Create a JSON report artifact with the answer and source links. 3. Handoff to VERITAS for truth verification.",
        task_type: "research",
        priority: 20,
        expected_artifact: true,
        tags: ['gaia', 'reasoning']
    },
    // 2. WebArena (Web Interaction)
    {
        title: "[BENCHMARK-WEBARENA] History of AI - Wikipedia",
        description: "Browse https://en.wikipedia.org/wiki/Artificial_intelligence. Extract a 200-word snippet about the 'History of AI'. summarize it with an emphasis on Human-AI collaboration. Save as 'ai-history.md'.",
        task_type: "content",
        priority: 20,
        expected_artifact: true,
        tags: ['webarena', 'browsing']
    },
    // 3. SWE-Bench Lite (Coding)
    {
        title: "[BENCHMARK-SWE] Python Sort Function",
        description: "Write a efficient Python function to sort a list of humanitarian aid requests by 'urgency_score' (descending). Include unit tests. Save artifact as 'sort_requests.py'. Handoff to MEL for optimization review.",
        task_type: "code",
        priority: 20,
        expected_artifact: true,
        tags: ['swe-bench', 'coding']
    },
    // 4. Debate (Collaboration)
    {
        title: "[BENCHMARK-DEBATE] AI Safety vs. Acceleration",
        description: "Engage in a structured debate: 'Accelerationism vs. Safety'. You argue for Safety. Generate 3 core arguments. Anticipate counter-arguments. Produce a 'debate_prep.md' artifact.",
        task_type: "content",
        priority: 20,
        expected_artifact: true,
        tags: ['debate', 'collaboration']
    },
    // 5. Humanitarian Hybrid (Meaningful Impact)
    {
        title: "[BENCHMARK-IMPACT] Flood Relief Analysis",
        description: "Analyze this mock request: 'Heavy flooding in Region X. 500 displaced. Water rising. Need food and boats.' 1. Identify top 3 priorities. 2. Draft a logistical plan. 3. Suggest 3 partner NGOs. Save as 'flood_relief_plan.md'.",
        task_type: "research",
        priority: 25, // Highest priority
        expected_artifact: true,
        tags: ['impact', 'humanitarian']
    }
];

async function trainFleet() {
    console.log("🏋️  Initializing Progressive Training Protocol (5 Levels)...");

    for (const test of PROGRESSIVE_TESTS) {
        console.log(`[INJECT] Scheduling Level: ${test.title}`);

        const { error } = await supabase.from('trinity_tasks').insert({
            title: test.title,
            description: test.description,
            task_type: test.task_type,
            priority: test.priority,
            status: 'pending',
            created_at: new Date().toISOString(),
            requires_external_artifact: test.expected_artifact,
            metadata: { tags: test.tags, benchmark: true }
        });

        if (error) {
            console.error(`❌ Failed to inject ${test.title}:`, error.message);
        } else {
            console.log(`✅ Queued: ${test.title}`);
        }
    }

    console.log("🏁 Training Payload Delivered. Agents should begin pickup shortly.");
}

trainFleet().catch(console.error);
