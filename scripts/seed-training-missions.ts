import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const trainingTasks = [
    {
        title: "[EASY-TRAINING] Squad Mascot Design (SVG)",
        description: `MISSION: Create a minimalist SVG mascot for the "Veritas Squad".
DIRECTIONS:
1. Research simple SVG shapes. You will need to create a new file.
2. Design a minimalist mascot using SVG syntax.
3. EXPECTED OUTPUT: A file named 'veritas-mascot.svg' containing valid <svg> code.
4. LOCATION: Save the file to 'artifacts/design/veritas-mascot.svg'.
5. SUBMISSION: Use the 'save_artifact' tool. Set type='design', title='Veritas Squad Mascot', and provide the file path.
6. COMPLETION: Once the artifact is saved, mark this task as done.`,
        priority: 5,
        status: 'pending',
        task_type: 'design',
        metadata: { category: 'training', difficulty: 'easy' }
    },
    {
        title: "[EASY-TRAINING] Utility: Task Duration Calculator",
        description: `MISSION: Create a TypeScript utility function to calculate task duration.
DIRECTIONS:
1. Create a new TypeScript file.
2. Implement a function 'calculateDuration(start: string, end: string): string' that returns the difference in a human-readable format (e.g., "2h 15m").
3. EXPECTED OUTPUT: A file named 'time-utils.ts' with the exported function.
4. LOCATION: Save to 'artifacts/code/time-utils.ts'.
5. SUBMISSION: Use the 'save_artifact' tool. Set type='code', title='Task Duration Utility', and provide the path.
6. COMPLETION: Mark as done after uploading.`,
        priority: 5,
        status: 'pending',
        task_type: 'code',
        metadata: { category: 'training', difficulty: 'easy' }
    },
    {
        title: "[EASY-TRAINING] Brand Color Palette (CSS)",
        description: `MISSION: Define a CSS variable color palette for the "Trinity Royal" theme.
DIRECTIONS:
1. Create a CSS file.
2. Define the following variables in :root:
   --trinity-gold: #D4AF37;
   --trinity-blue: #002366;
   --trinity-slate: #708090;
3. EXPECTED OUTPUT: A file named 'trinity-royal-theme.css'.
4. LOCATION: Save to 'artifacts/design/trinity-royal-theme.css'.
5. SUBMISSION: Use 'save_artifact' with type='design' and title='Trinity Royal Theme'.
6. COMPLETION: Mark as done.`,
        priority: 5,
        status: 'pending',
        task_type: 'design',
        metadata: { category: 'training', difficulty: 'easy' }
    },
    {
        title: "[EASY-TRAINING] Agent Self-Assessment Template (MD)",
        description: `MISSION: Create a markdown template for agent self-assessments.
DIRECTIONS:
1. Create a markdown file.
2. Include sections for: # Self-Assessment, ## Current Objective, ## Achievements, ## Challenges, ## Next Steps.
3. EXPECTED OUTPUT: A file named 'self-assessment-template.md'.
4. LOCATION: Save to 'artifacts/reports/self-assessment-template.md'.
5. SUBMISSION: Use 'save_artifact' with type='report' and title='Agent Assessment Template'.
6. COMPLETION: Mark as done.`,
        priority: 5,
        status: 'pending',
        task_type: 'documentation',
        metadata: { category: 'training', difficulty: 'easy' }
    },
    {
        title: "[EASY-TRAINING] Mock JSON: Agent Performance",
        description: `MISSION: Create a JSON file with mock performance data.
DIRECTIONS:
1. Create a JSON file.
2. Include an array of 3 agent objects, each with 'name', 'tasks_completed' (number), and 'success_rate' (percentage).
3. EXPECTED OUTPUT: A file named 'mock-performance.json'.
4. LOCATION: Save to 'artifacts/data/mock-performance.json'.
5. SUBMISSION: Use 'save_artifact' with type='data' and title='Mock Performance Data'.
6. COMPLETION: Mark as done.`,
        priority: 5,
        status: 'pending',
        task_type: 'data',
        metadata: { category: 'training', difficulty: 'easy' }
    }
];

async function seed() {
    console.log("🌱 Seeding 5 Training Missions...");
    // First, let's check if they already exist to avoid duplicates if we re-run
    const titles = trainingTasks.map(t => t.title);
    const { data: existing } = await supabase
        .from('trinity_tasks')
        .select('title')
        .in('title', titles);

    const existingTitles = existing?.map(e => e.title) || [];
    const ToInsert = trainingTasks.filter(t => !existingTitles.includes(t.title));

    if (ToInsert.length === 0) {
        console.log("⏭️ All tasks already exist. Skipping.");
        return;
    }

    const { error } = await supabase.from('trinity_tasks').insert(ToInsert);
    if (error) {
        console.error("❌ Seeding failed:", error.message);
    } else {
        console.log(`✅ ${ToInsert.length} training missions seeded successfully.`);
    }
}

seed();
