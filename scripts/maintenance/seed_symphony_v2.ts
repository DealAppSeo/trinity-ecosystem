
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const TASKS = [
    {
        title: "[FRONTEND] Create Glassmorphism UI Component",
        description: "Generate a premium HTML/CSS snippet for a glassmorphism card with hover animations. Save as artifact.",
        assigned_to: "trinity-mel",
        priority: 4,
        status: "todo"
    },
    {
        title: "[LOGIC] Design Swarm Routing Flow in Miro",
        description: "Create a visual flowchart in Miro showing how a task moves from 'todo' to 'verified' in the Trinity system.",
        assigned_to: "trinity-orch",
        priority: 5,
        status: "todo"
    },
    {
        title: "[DATA] Sync Latest RepID Metrics to Airtable",
        description: "Use the Airtable MCP to sync current agent reputation scores into the 'Squad Metrics' table.",
        assigned_to: "trinity-orch",
        priority: 3,
        status: "todo"
    },
    {
        title: "[KNOWLEDGE] Summarize Trinity Constitution",
        description: "Read the CONSTITUTION.md and provide a 3-paragraph summary for the Document360 knowledge base.",
        assigned_to: "trinity-sophia",
        priority: 4,
        status: "todo"
    },
    {
        title: "[CODE] Optimize Task Cleanup Script",
        description: "Refactor scripts/emergency_reset.ts to be more efficient and add error logging.",
        assigned_to: "trinity-hdm",
        priority: 5,
        status: "todo"
    }
];

async function seedSymphony() {
    console.log('🎵 Seeding Diverse Symphony Tasks...');
    for (const task of TASKS) {
        const { error } = await supabase.from('trinity_tasks').insert([task]);
        if (error) {
            console.error(`❌ Error seeding task "${task.title}":`, error.message);
        } else {
            console.log(`✅ Seeded: ${task.title}`);
        }
    }
}

seedSymphony();
