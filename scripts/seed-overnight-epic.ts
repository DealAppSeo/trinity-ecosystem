import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const EPIC_MISSIONS = [
    // --- ALPHA SQUAD (Marketing, Truth, Research) ---
    {
        title: "[ALPHA] [FOUNDATION] Daily Truth Log Audit",
        description: "Analyze the last 10 agent logs for 'truth' or 'virtue' keywords. Summarize the findings into a 'Truth Audit' report.",
        task_type: "research",
        priority: 10,
        metadata: { squad: "ALPHA", tier: "Foundation" }
    },
    {
        title: "[ALPHA] [CONSTRUCTION] Visionary Manifesto: Section III Draft",
        description: "Draft a section for the Trinity Manifesto titled 'The Neural Commons'. Focus on the ethics of decentralized intelligence.",
        task_type: "content",
        priority: 25,
        metadata: { squad: "ALPHA", tier: "Construction" }
    },
    {
        title: "[ALPHA] [STRATEGY] Market Sentiment: AI Agents on X",
        description: "Research current sentiment on X/Twitter regarding 'Autonomous Agent Swarms'. Identify top 3 influencers in the space.",
        task_type: "research",
        priority: 40,
        metadata: { squad: "ALPHA", tier: "Strategy" }
    },
    {
        title: "[ALPHA] [EVOLUTION] RepID Algorithm Peer-Review",
        description: "Review the current RepID logic in ConstitutionalAgent.ts. Suggest one enhancement to make slashing more anti-fragile.",
        task_type: "research",
        priority: 60,
        metadata: { squad: "ALPHA", tier: "Evolution" }
    },

    // --- BETA SQUAD (Design, UI, UX) ---
    {
        title: "[BETA] [FOUNDATION] Icon Consistency Audit",
        description: "Check the 'lucide-react' icons used in Sidebar.tsx. Recommend icons for a new 'Science' and 'Intelligence' page.",
        task_type: "design",
        priority: 10,
        metadata: { squad: "BETA", tier: "Foundation" }
    },
    {
        title: "[BETA] [CONSTRUCTION] Glassmorphic CSS Toolkit",
        description: "Create a set of CSS utility classes for glassmorphism. Include varying levels of blur and transparency.",
        task_type: "design",
        priority: 25,
        metadata: { squad: "BETA", tier: "Construction" }
    },
    {
        title: "[BETA] [STRATEGY] User Journey: Onboarding Bridge",
        description: "Map out the ideal onboarding journey for a new founder joining the symphony. Use Mermaid flow diagram.",
        task_type: "design",
        priority: 40,
        metadata: { squad: "BETA", tier: "Strategy" }
    },
    {
        title: "[BETA] [EVOLUTION] Adaptive Theme Proposal",
        description: "Propose a design for a theme that changes based on 'Ecosystem Health' (e.g., Red blur if tasks are failed).",
        task_type: "design",
        priority: 60,
        metadata: { squad: "BETA", tier: "Evolution" }
    },

    // --- GAMMA SQUAD (Build, Code, Infrastructure) ---
    {
        title: "[GAMMA] [FOUNDATION] Code Documentation Sprint (Lib)",
        description: "Audit files in 'lib/utils' and ensure all exported functions have clear JSDoc comments.",
        task_type: "code",
        priority: 10,
        metadata: { squad: "GAMMA", tier: "Foundation" }
    },
    {
        title: "[GAMMA] [CONSTRUCTION] Task Duration Estimator Utility",
        description: "Implement a utility function 'estimateTaskTime' that takes complexity and returns a human-readable estimate.",
        task_type: "code",
        priority: 25,
        metadata: { squad: "GAMMA", tier: "Construction" }
    },
    {
        title: "[GAMMA] [STRATEGY] Database Indexing Audit",
        description: "Review the current trinity_tasks schema. Suggest 2 new indexes to optimize 'pending' task lookups.",
        task_type: "research",
        priority: 40,
        metadata: { squad: "GAMMA", tier: "Strategy" }
    },
    {
        title: "[GAMMA] [EVOLUTION] Self-Healing Loop: Error Pattern Filter",
        description: "Propose a logic update to EvolutionaryLogger.ts to filter out transient network errors from true build failures.",
        task_type: "code",
        priority: 60,
        metadata: { squad: "GAMMA", tier: "Evolution" }
    }
];

async function seed() {
    console.log("🚀 Seeding 12 EPIC Overnight Missions...");
    const { error } = await supabase.from('trinity_tasks').insert(EPIC_MISSIONS.map(m => ({
        ...m,
        status: 'pending',
        created_at: new Date().toISOString()
    })));

    if (error) console.error("❌ Seeding failed:", error.message);
    else console.log("✅ Epic Missions seeded successfully.");
}

seed();
