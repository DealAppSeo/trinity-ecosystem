import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const simpleMissions = [
    {
        title: "[BOOTSTRAP-1] Mission Statement Validation",
        description: "PHASE 1 (Simple): Research the 'Trinity Manifesto' documents in the Docs folder. Summarize the top 3 core principles. Use the findings to create a short MISSION_SUMMARY.md artifact.",
        task_type: "research",
        priority: 100,
        status: "pending",
        metadata: { tier: "Simple", instructions: "Read local docs, output text summary." }
    },
    {
        title: "[BOOTSTRAP-2] Swarm Visual Status Report",
        description: "PHASE 1 (Simple): Examine the current trinity_agent_registry. Create a status report (STATUS_REPORT.md) highlighting which agents have the most completed tasks and which have the highest reputation.",
        task_type: "report",
        priority: 95,
        status: "pending",
        metadata: { tier: "Simple", instructions: "Query DB registry, output md table." }
    },
    {
        title: "[BOOTSTRAP-3] Constitution Awareness Check",
        description: "PHASE 1 (Simple): Read CONSTITUTION.md. Select one 'Article' and explain how it applies to AI safety in our swarm. Save this as CONSTITUTION_REFLECT.md.",
        task_type: "research",
        priority: 90,
        status: "pending",
        metadata: { tier: "Simple", instructions: "Read constitution, output reflection." }
    },
    {
        title: "[BOOTSTRAP-4] Code Structure Mapping",
        description: "PHASE 2 (Moderate): Deep dive into the folder structure of trinity-ecosystem. Create a DIRECTORY_MAP.md that describes the purpose of the 'lib', 'app', and 'scripts' folders.",
        task_type: "report",
        priority: 85,
        status: "pending",
        metadata: { tier: "Moderate", instructions: "Explore filesystem, output architecture map." }
    }
];

async function seed() {
    console.log("🌱 Seeding Simple Onboarding Cluster...");
    const { data, error } = await supabase.from('trinity_tasks').insert(simpleMissions);
    if (error) console.error("❌ Seeding failed:", error.message);
    else console.log("✅ Simple Onboarding Cluster Seeded.");
}

seed();
