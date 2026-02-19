import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const simpleTasks = [
    {
        title: "[BASIC] System Architecture Overview",
        description: `MISSION: Create a high-level architecture overview of the Trinity Ecosystem.
DIRECTIONS:
1. Research the core components (ConstitutionalAgent, MCP, Supabase, Python Brain).
2. Create a markdown document mapping the data flow.
3. EXPECTED ARTIFACT: A file named 'ARCHITECTURE_OVERVIEW.md' in the 'artifacts/reports' directory.
4. FORMAT: Use headers, bullet points, and a mermaid diagram if possible.
5. FINAL STEP: Call 'save_artifact' tool with type='report' and title='System Architecture Overview'.`,
        priority: 10,
        status: 'pending',
        task_type: 'research'
    },
    {
        title: "[BASIC] Virtue Resonance Check",
        description: `MISSION: Verify that the 8 Constitution Virtues are being up-held.
DIRECTIONS:
1. Read the CONSTITUTION.md (or 'lib/agent/wisdom.ts').
2. Choose one virtue (e.g., TRUE or NOBLE).
3. Write a 3-paragraph reflection on how an AI agent can embody this virtue.
4. EXPECTED ARTIFACT: A file named 'VIRTUE_REFLECT_X.md' in 'artifacts/wisdom/'.
5. FINAL STEP: Call 'save_artifact' tool with type='document' and title='Virtue Reflection'.`,
        priority: 10,
        status: 'pending',
        task_type: 'content'
    },
    {
        title: "[BASIC] UX Feedback: Swarm Dashboard",
        description: `MISSION: Provide critical UX feedback on the Founders Dashboard.
DIRECTIONS:
1. Examine 'app/pulse/directives/page.tsx'.
2. Identify 3 areas where the UI could be more intuitive for a human 'Founder'.
3. Propose specific component changes (e.g., 'Add a task search bar').
4. EXPECTED ARTIFACT: A file named 'UX_FEEDBACK_DASHBOARD.md' in 'artifacts/design/'.
5. FINAL STEP: Call 'save_artifact' tool with type='design' and title='UX Feedback: Dashboard'.`,
        priority: 10,
        status: 'pending',
        task_type: 'design'
    }
];

async function seed() {
    console.log("🌱 Seeding 3 Simple Tasks...");
    const { error } = await supabase.from('trinity_tasks').insert(simpleTasks);
    if (error) console.error("❌ Seeding failed:", error.message);
    else console.log("✅ Simple tasks seeded successfully.");
}

seed();
