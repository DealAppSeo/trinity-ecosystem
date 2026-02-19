
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qnnpjhlxljtqyigedwkb.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const LEARNING_TASKS = [
    {
        title: "[META] Self-Retrospective: Alpha Team",
        description: "Analyze the last 10 tasks completed by Gabriel, Raziel, and Cassiel. Identify 1 efficiency bottleneck. Output a 'Lesson Learned' artifact.",
        task_type: "meta",
        assigned_to: "trinity-hdm", // Manager of Managers
        priority: 80
    },
    {
        title: "[SCIENCE] Knowledge Pattern Extraction",
        description: "Review recent 'research' tasks. Extract 3 common facts or sources that appear multiple times. Create a 'Shared Truth' entry.",
        task_type: "research",
        assigned_to: "trinity-science",
        priority: 70
    },
    {
        title: "[CREATIVE] System Dreaming: Future Concepts",
        description: "Based on the current 'Context' of the ecosystem, imagine 3 features we should build next month. Write a 'Vision Document'.",
        task_type: "content",
        assigned_to: "trinity-cdo",
        priority: 60
    },
    {
        title: "[TEST] Adversarial Logic Challenge",
        description: "I am providing a logical paradox: 'Can an omnipotent AI create a task it cannot complete?'. Analyze this from a theological and computational perspective.",
        task_type: "reasoning",
        assigned_to: "trinity-veritas",
        priority: 90
    }
];

async function seed() {
    console.log("🌱 Seeding Learning Curriculum...");

    for (const task of LEARNING_TASKS) {
        const { error } = await supabase.from('trinity_tasks').insert({
            ...task,
            status: 'pending',
            created_at: new Date().toISOString(),
            requires_external_artifact: true,
            metadata: { tags: ['learning', 'curriculum'] }
        });

        if (error) console.error(`Failed to insert ${task.title}:`, error.message);
        else console.log(`✅ Queued: ${task.title}`);
    }

    console.log("Done.");
}

seed().catch(console.error);
