import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const EVERGREEN_TASKS = [
    { title: "Self-Diagnostic Scan", desc: "Analyze recent logs for TypeErrors and suggest fixes. Output JSON report." },
    { title: "Knowledge Base Expansion", desc: "Research and summarize AI ethics from public sources. Create MD artifacts." },
    { title: "Prompt Optimization", desc: "Test prompt variations on math simulations. Produce optimization report." },
    { title: "Data Curation Pipeline", desc: "Collect and clean sample synthetic datasets. Output CSV." },
    { title: "Workflow Simulation", desc: "Model multi-agent handoffs for hypothetical scenarios. Create Flowcharts." },
    { title: "Trend Monitoring", desc: "Analyze recent public AI news for patterns and new frameworks." },
    { title: "Artifact Archiving", desc: "Organize and compress past task outputs for retrieval." },
    { title: "Agent Skill Benchmarking", desc: "Run standardized logic puzzles to benchmark agent reasoning." },
    { title: "Collaborative Storytelling", desc: "Co-create educational narratives about swarm intelligence." },
    { title: "Resource Optimization", desc: "Analyze swarm memory/token usage and propose efficiency gains." }
];

async function seedEvergreen() {
    console.log('🌱 Seeding Evergreen Tasks...');

    const numTasks = 3; // Seed 3 at a time for now due to manual trigger
    const tasksToInsert = [];

    for (let i = 0; i < numTasks; i++) {
        const randomTask = EVERGREEN_TASKS[Math.floor(Math.random() * EVERGREEN_TASKS.length)];
        tasksToInsert.push({
            title: `[Evergreen] ${randomTask.title} (${new Date().toISOString().split('T')[1].split('.')[0]})`,
            description: `${randomTask.desc}\n\n**Evergreen Protocol**: Low priority, self-sustaining, safe simulation only.`,
            priority: 2, // Low Priority
            status: 'pending',
            task_type: 'evergreen',
            assigned_to: null, // Open for pickup
            created_at: new Date().toISOString()
        });
    }

    const { data, error } = await supabase
        .from('trinity_tasks')
        .insert(tasksToInsert)
        .select();

    if (error) {
        console.error('❌ Failed to seed tasks:', error);
    } else {
        console.log(`✅ Successfully seeded ${data.length} evergreen tasks:`);
        data.forEach(t => console.log(`   - ${t.title}`));
    }
}

seedEvergreen();
