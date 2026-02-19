
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const TEST_TASKS = [
    {
        title: '[VALIDATION] Market Research Report: AI Agents 2026',
        description: 'Perform a deep dive into the current market trends for autonomous AI agents in early 2026. Create a detailed markdown report artifact using the save_artifact tool. The report must include at least 3 credible sources, a SWOT analysis, and a technical section on GNN-based reputation systems.',
        task_type: 'research',
        priority: 80,
        status: 'pending',
        metadata: { validation: true, artifact_required: true, artifact_type: 'report' }
    },
    {
        title: '[VALIDATION] Design Mockup: Trinity Mobile Dashboard',
        description: 'Generate a high-quality visual concept for the Trinity Mobile Dashboard. Use the generate_image tool to create a glassmorphism-style UI concept. Then, create a design specification artifact (CSS/Tailwind) that matches the visual style.',
        task_type: 'design',
        priority: 85,
        status: 'pending',
        metadata: { validation: true, artifact_required: true, artifact_type: 'design' }
    },
    {
        title: '[VALIDATION] GNN Reputation Data Analysis',
        description: 'Simulate a dataset of 10 agents and their task completion metrics. Create a structured data artifact (JSON or CSV) representing this dataset. Then, provide a brief analysis of how the Multiplicative GNN Trust Scaling would affect their scores.',
        task_type: 'data',
        priority: 75,
        status: 'pending',
        metadata: { validation: true, artifact_required: true, artifact_type: 'data' }
    }
];

async function seed() {
    console.log('🌱 Seeding validation tasks...');
    for (const task of TEST_TASKS) {
        const { data, error } = await supabase.from('trinity_tasks').insert([task]);
        if (error) console.error(`❌ Error seeding task "${task.title}":`, error.message);
        else console.log(`✅ Seeded: ${task.title}`);
    }
    console.log('🚀 Seeding complete.');
}

seed();
