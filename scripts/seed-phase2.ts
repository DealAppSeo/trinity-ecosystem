import { supabase } from '../lib/supabase';

async function seedPhase2Tasks() {
    const tasks = [
        {
            title: "[RESEARCH] Global Market Sentiment via You.com",
            description: "Use You.com research tools to analyze current AI market sentiment and post a summary to the Global Blackboard.",
            task_type: "research",
            priority: 70,
            status: "pending",
            assigned_to: "trinity-veritas"
        },
        {
            title: "[SOCIAL_AUDIT] Human-Centric AI Policy",
            description: "Review our Trinity Constitution and use ASI1 to audit the latest social resonance of our agentic outputs.",
            task_type: "social-intelligence",
            priority: 85,
            status: "pending",
            assigned_to: "trinity-chesed"
        },
        {
            title: "[INFRA] Comprehensive Self-Healing Audit",
            description: "Validate the RailwayMCP integration by querying all services and simulating a healing sequence for the inference proxy.",
            task_type: "infra",
            priority: 95,
            status: "pending",
            assigned_to: "trinity-nexus"
        },
        {
            title: "[RAG] Cohere ReRank Optimization",
            description: "Ingest the infrastructure roadmap and use Cohere ReRank to identify the top 3 critical implementation paths for Q1.",
            task_type: "research",
            priority: 60,
            status: "pending",
            assigned_to: "trinity-torch"
        }
    ];

    console.log("🚀 Seeding Phase 2 tasks...");
    const { error } = await supabase.from('trinity_tasks').insert(tasks);

    if (error) {
        console.error("❌ Failed to seed tasks:", error.message);
    } else {
        console.log("✅ Phase 2 tasks seeded successfully!");
    }
}

seedPhase2Tasks();
