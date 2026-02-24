import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const testerMissions = [
    {
        title: "[ONBOARD-MEL] UI/UX Audit & PWA Optimization",
        description: "Examine the current Controller PWA (components/ui/NavBar.tsx, app/layout.tsx). Identify 3 areas where the mobile experience can be improved for 'Early Adopters'. Create a wireframe or markdown report MEL_UX_AUDIT.md.",
        task_type: "design",
        priority: 80,
        status: "todo",
        metadata: { squad: "BETA", agent: "trinity-mel", tier: "specialist" }
    },
    {
        title: "[ONBOARD-TORCH] Viral Loop & Social Integration Spec",
        description: "Research viral growth hooks for ethical AI swarms. Draft a strategy for TORCH to autonomously share 'Trinity Artifacts' to X/Twitter via the social bridge. Output TORCH_SOCIAL_STRATEGY.md.",
        task_type: "marketing",
        priority: 80,
        status: "todo",
        metadata: { squad: "ALPHA", agent: "trinity-torch", tier: "specialist" }
    },
    {
        title: "[ONBOARD-VERITAS] Reputation Threshold Validation",
        description: "Analyze the current SBFA operator results. Determine the optimal reputation threshold for 'Tester' verification. Produce a quantitative report VERITAS_REP_THRESHOLD.md.",
        task_type: "research",
        priority: 85,
        status: "todo",
        metadata: { squad: "ALPHA", agent: "trinity-veritas", tier: "conductor" }
    }
];

async function seed() {
    console.log("🌱 Seeding Specialized Tester Onboarding Flow (MEL, TORCH, VERITAS)...");
    const { data, error } = await supabase.from('trinity_tasks').insert(testerMissions);
    if (error) console.error("❌ Seeding failed:", error.message);
    else console.log("✅ Tester Onboarding Flow Seeded.");
}

seed();
