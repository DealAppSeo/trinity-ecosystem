import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const validationTasks = [
    {
        title: "[STABILITY] Core Logic Validation (Alpha Pod)",
        description: "Execute a deep dive into the current agent loop robustness. Verify that defensive parsing prevents crashes during LLM failover. Output a bulleted list of hardened features.",
        task_type: "research",
        priority: 95,
        status: "pending",
        assigned_to: "trinity-veritas"
    },
    {
        title: "[STABILITY] Cross-Provider Resilience (Beta Pod)",
        description: "Initiate a cross-provider test. Use the research tool to find the latest trends in neuro-symbolic AI. Verify that malformed tool outputs are handled gracefully.",
        task_type: "report",
        priority: 95,
        status: "pending",
        assigned_to: "trinity-mel"
    },
    {
        title: "[STABILITY] Artifact Consistency Audit (Gamma Pod)",
        description: "Generate a markdown artifact summarizing the recent swarm recovery mission. Ensure both database and storage links are correctly populated.",
        task_type: "report",
        priority: 95,
        status: "pending",
        assigned_to: "trinity-hdm"
    }
];

async function seed() {
    console.log("🌱 Seeding Stability Validation Cluster...");
    const { data, error } = await supabase.from('trinity_tasks').insert(validationTasks);
    if (error) console.error("❌ Seeding failed:", error.message);
    else console.log("✅ Stability Cluster Seeded.");
}

seed();
