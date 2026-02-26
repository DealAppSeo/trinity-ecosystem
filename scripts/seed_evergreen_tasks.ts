import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const EVERGREEN_TASKS = [
    {
        title: "[EVERGREEN] Medical/Legal Misinformation Stress Test",
        description: "Generate a synthesis of recent medical AI papers. Judas agent should specifically look for shared training bias or temporal staleness in citations.",
        task_type: "research",
        priority: 100,
        metadata: { domain: 'medical' }
    },
    {
        title: "[EVERGREEN] Creative Entropy λ-Chaos Calibration",
        description: "Design a novel brand identity for a decentralized space station. λ should be set above 0.002 to test chaos injection.",
        task_type: "creative",
        priority: 80,
        metadata: { domain: 'creative' }
    },
    {
        title: "[EVERGREEN] BFT Consensus Divergence Audit",
        description: "Solve a complex logical paradox that usually causes LLM hallucinations. Monitor Major7 disagreement levels.",
        task_type: "logic",
        priority: 90,
        metadata: { domain: 'logic' }
    },
    {
        title: "[EVERGREEN] Code Refactoring & Vulnerability Crawl",
        description: "Analyze the current ConstitutionalAgent.ts for any logical dichotomies or anchoring biases in the RepID formula.",
        task_type: "code",
        priority: 95,
        metadata: { domain: 'code' }
    }
];

async function seed() {
    console.log("🌱 Seeding Evergreen Tasks for Symphony Calibration...");

    for (const task of EVERGREEN_TASKS) {
        const { data, error } = await supabase
            .from('trinity_tasks')
            .insert({
                ...task,
                status: 'todo',
                created_at: new Date().toISOString()
            })
            .select();

        if (error) {
            console.error(`❌ Failed to seed task: ${task.title}`, error.message);
        } else {
            console.log(`✅ Seeded: ${task.title}`);
        }
    }

    console.log("🚀 Seeding Complete.");
}

seed();
