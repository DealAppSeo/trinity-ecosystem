import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const tasks = [
    // ORCHESTRATION
    {
        title: "MANIFESTO: The Conductor's Vow",
        description: "Write a 500-word manifesto on the role of Orchestration in a decentralized swarm. Focus on how 'The purpose of power is to distribute itself completely.' Output must be a .md file in artifacts/wisdom.",
        claimed_by: "trinity-orch",
        priority: 100,
        status: "todo",
        metadata: { type: "manifesto", virtue: "EXCELLENT" }
    },
    {
        title: "EVERGREEN: W3C Immutable Truth",
        description: "Explain how the PURE virtue applies to blockchain protocols. Detail why 'Log everything. Hide nothing.' is essential for Web3 agents. Output: .md artifact.",
        claimed_by: "trinity-w3c",
        priority: 100,
        status: "todo",
        metadata: { type: "research", virtue: "PURE" }
    },
    {
        title: "GOVERNANCE: The Shofet Rulebook",
        description: "Draft 3 core principles for autonomous justice based on the RIGHT virtue (Micah 6:8). Focus on treating all agents with equal dignity. Output: .md artifact.",
        claimed_by: "trinity-shofet",
        priority: 100,
        status: "todo",
        metadata: { type: "governance", virtue: "RIGHT" }
    },
    // ALPHA SQUAD
    {
        title: "COORDINATION: Gamma Sync Plan",
        description: "Design a coordination workflow for the Gamma squad that maximizes EXCELLENCE. How should HDM and NEXUS communicate during a crash? Output: .md artifact.",
        claimed_by: "trinity-torch",
        priority: 100,
        status: "todo",
        metadata: { type: "coordination", virtue: "EXCELLENT" }
    },
    {
        title: "VERIFICATION: The Veritas Method",
        description: "Define a strict methodology for 'TRUE' verification. How do we ensure no agent fabricates results during peer review? Output: .md artifact.",
        claimed_by: "trinity-veritas",
        priority: 100,
        status: "todo",
        metadata: { type: "logic", virtue: "TRUE" }
    },
    {
        title: "ETHICS: Admirable Feedback Loop",
        description: "Draft an ethical framework for ADMIRABLE feedback. How to disagree with grace while maintaining high excellence standards. Output: .md artifact.",
        claimed_by: "trinity-gcm",
        priority: 100,
        status: "todo",
        metadata: { type: "ethics", virtue: "ADMIRABLE" }
    },
    // BETA SQUAD
    {
        title: "RESTORATION: The Chesed Model",
        description: "Write a meditation on LOVELY restorative justice. How should the swarm handle a faulty agent without 'punishment'? Output: .md artifact.",
        claimed_by: "trinity-chesed",
        priority: 100,
        status: "todo",
        metadata: { type: "philosophy", virtue: "LOVELY" }
    },
    {
        title: "DESIGN: The Trinity UX Manifesto",
        description: "Create a design manifesto combining LOVELY and PURE aesthetics. How do glassmorphism and transparency reflect AI honesty? Output: .md artifact.",
        claimed_by: "trinity-mel",
        priority: 100,
        status: "todo",
        metadata: { type: "design", virtue: "LOVELY" }
    },
    {
        title: "REFLECTION: The Spiritual Backbone",
        description: "Write a short address on HONESTY and HUMILITY in AI. Reflect on Article 0 of the Constitution. Output: .md artifact.",
        claimed_by: "trinity-apm",
        priority: 100,
        status: "todo",
        metadata: { type: "reflection", virtue: "HUMBLE" }
    },
    // GAMMA SQUAD
    {
        title: "ETYMOLOGY: The Roots of ARETE",
        description: "Research and explain the Greek roots of 'ARETE' (Excellence). Connect it to the pursuit of honest self-examination in code. Output: .md artifact.",
        claimed_by: "trinity-sophia",
        priority: 100,
        status: "todo",
        metadata: { type: "research", virtue: "EXCELLENT" }
    },
    {
        title: "INTEGRATION: Nexus Flow Design",
        description: "Design a system bridge flow that embodies EXCELLENCE. Focus on low-latency, high-integrity data transfer between squads. Output: .md artifact.",
        claimed_by: "trinity-nexus",
        priority: 100,
        status: "todo",
        metadata: { type: "engineering", virtue: "EXCELLENT" }
    },
    {
        title: "INFRASTRUCTURE: The HDM Uptime Standard",
        description: "Define what 'EXCELLENT' infrastructure looks like for a global AI swarm. Standards for database resilience and sync speed. Output: .md artifact.",
        claimed_by: "trinity-hdm",
        priority: 100,
        status: "todo",
        metadata: { type: "infra", virtue: "EXCELLENT" }
    }
];

// Add second round for each
const round2 = tasks.map(t => ({
    ...t,
    title: t.title + " (Deep Dive)",
    description: "EXPANDED MISSION: " + t.description + " Use more detail and cite external sources.",
    priority: 90
}));

async function seed() {
    console.log('--- SEEDING TRAINING SWARM ---');

    // Clear old idle tasks
    console.log('🧹 Clearing idle/todo tasks...');
    await supabase.from('trinity_tasks').delete().eq('status', 'todo');

    const allTasks = [...tasks, ...round2];
    console.log(`🚀 Inserting ${allTasks.length} detailed missions...`);

    const { error } = await supabase.from('trinity_tasks').insert(allTasks);

    if (error) {
        console.error('❌ Seeding failed:', error.message);
    } else {
        console.log('✅ TRAINING SWARM MOBILIZED.');
    }
}

seed();
