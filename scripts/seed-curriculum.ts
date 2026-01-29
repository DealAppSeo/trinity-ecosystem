import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(url, key);

const CURRICULUM = {
    easy: [
        {
            title: "[CURRICULUM] Easy: Design - Trinity Gold Utility",
            description: "Create a CSS utility file named 'trinity-gold.css' that defines a set of variables for the 'Trinity Gold' color palette. Include at least 5 shades and 3 gradients. Save the file to 'artifacts/curriculum/design/trinity-gold.css'.",
            metadata: { tier: "easy", category: "design", curriculum: true }
        },
        {
            title: "[CURRICULUM] Easy: Code - Artifact Interface",
            description: "Define a TypeScript interface for a 'SwarmArtifact' that includes fields for: id, type, creator, timestamp, content, and metadata. Save it to 'artifacts/curriculum/code/artifact-interface.ts'.",
            metadata: { tier: "easy", category: "code", curriculum: true }
        }
    ],
    medium: [
        {
            title: "[CURRICULUM] Medium: Design - Response Task Card",
            description: "Design a responsive React component (using vanilla CSS) for a 'Task Card'. It should handle long descriptions gracefully and show a status badge. Save the React code and CSS to 'artifacts/curriculum/design/task-card.js'.",
            metadata: { tier: "medium", category: "design", curriculum: true }
        },
        {
            title: "[CURRICULUM] Medium: Code - Learning Velocity Calc",
            description: "Write a TypeScript function that calculates 'Learning Velocity' based on an array of task objects (duration vs complexity). Include error handling for missing data. Save it to 'artifacts/curriculum/code/learning-velocity.ts'.",
            metadata: { tier: "medium", category: "code", curriculum: true }
        }
    ],
    complex: [
        {
            title: "[CURRICULUM] Complex: Design - Glassmorphism Dashboard",
            description: "Design a full-page 'Swarm Dashboard' layout using Glassmorphism principles. Must include subtle CSS animations for entering elements. Save to 'artifacts/curriculum/design/glass-dashboard.html'.",
            metadata: { tier: "complex", category: "design", curriculum: true }
        },
        {
            title: "[CURRICULUM] Complex: Code - Dependency Resolver",
            description: "Implement a robust 'Task Dependency Resolver' in TypeScript that takes a list of tasks and their requirements, and outputs a valid execution order. Must handle and detect circular dependencies. Save to 'artifacts/curriculum/code/dep-resolver.ts'.",
            metadata: { tier: "complex", category: "code", curriculum: true }
        }
    ]
};

async function seedCurriculum() {
    console.log("🎓 Starting Progressive Curriculum Seeder...");

    // 1. Check current progress
    const { data: completions, error: compError } = await supabase
        .from('trinity_tasks')
        .select('metadata, completed_by')
        .eq('status', 'verified')
        .not('completed_by', 'is', null);

    if (compError) {
        console.error("Error fetching completions:", compError.message);
        return;
    }

    const tierCounts: Record<string, Set<string>> = {
        easy: new Set(),
        medium: new Set(),
        complex: new Set()
    };

    completions?.forEach(task => {
        const tier = (task as any).metadata?.tier;
        const agent = (task as any).completed_by;
        if (tier && tierCounts[tier]) {
            tierCounts[tier].add(agent);
        }
    });

    const threshold = 6;
    let targetTier = "easy";

    if (tierCounts.easy.size >= threshold) {
        targetTier = "medium";
    }
    if (tierCounts.medium.size >= threshold) {
        targetTier = "complex";
    }

    console.log(`📊 Swarm Progress: Easy: ${tierCounts.easy.size}, Medium: ${tierCounts.medium.size}, Complex: ${tierCounts.complex.size}`);
    console.log(`🎯 Targeting Tier: ${targetTier.toUpperCase()}`);

    // 2. Check if we already have pending tasks for this tier
    const { count: pendingCount, error: pendingError } = await supabase
        .from('trinity_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .eq('metadata->>curriculum', 'true')
        .eq('metadata->>tier', targetTier);

    if (pendingError) {
        console.error("Error checking pending tasks:", pendingError.message);
        return;
    }

    if ((pendingCount || 0) > 0) {
        console.log(`🧊 Target tier ${targetTier} already has ${pendingCount} pending tasks. Skipping seed.`);
        return;
    }

    // 3. Seed tasks
    const tasksToSeed = CURRICULUM[targetTier as keyof typeof CURRICULUM].map(t => ({
        ...t,
        status: 'pending',
        priority: 5,
        created_at: new Date().toISOString()
    }));

    // Seed 12 tasks (6 design, 6 code) to ensure everyone has a shot and we can hit the threshold
    const expandedTasks = [];
    for (let i = 0; i < 6; i++) {
        expandedTasks.push({ ...tasksToSeed[0], title: `${tasksToSeed[0].title} (v${i + 1})` });
        expandedTasks.push({ ...tasksToSeed[1], title: `${tasksToSeed[1].title} (v${i + 1})` });
    }

    const { error: seedError } = await supabase
        .from('trinity_tasks')
        .insert(expandedTasks);

    if (seedError) {
        console.error("❌ Failed to seed curriculum:", seedError.message);
    } else {
        console.log(`✅ Successfully seeded 12 tasks for tier ${targetTier.toUpperCase()}.`);
    }
}

seedCurriculum().catch(err => console.error("Fatal Error:", err));
