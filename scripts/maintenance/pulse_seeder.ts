
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const TASK_POOL = [
    { title: "[UI] Design Dashboard Stats Row", description: "Create a React component for a dashboard row showing 4 key metrics with animations.", assigned_to: "trinity-mel" },
    { title: "[LOGIC] Map Agent Handover Protocol", description: "Use Miro to design how Trinity agents pass artifacts to each other for verification.", assigned_to: "trinity-orch" },
    { title: "[RESEARCH] Audit AI Model Costs", description: "Search for current pricing of Sonnet 3.5 vs GPT-4o and create a comparison document.", assigned_to: "trinity-sophia" },
    { title: "[CODE] Implement Error Handling for MCPs", description: "Add try/catch blocks and logging to the DataMCP.ts tools.", assigned_to: "trinity-hdm" },
    { title: "[MARKETING] Draft Project Teaser", description: "Write a high-energy teaser for the Trinity Symphony ecosystem launch.", assigned_to: "trinity-gcm" },
    { title: "[VERIFY] Cross-Check Reputation Ledger", description: "Verify that RepID updates are correctly reflected in the trinity_agent_registry.", assigned_to: "trinity-veritas" }
];

async function seedPulse() {
    console.log(`[PULSE] 💓 Seeding fresh tasks at ${new Date().toLocaleTimeString()}...`);

    // Pick 3 random tasks from the pool
    const shuffled = TASK_POOL.sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 3);

    for (const task of selected) {
        const { error } = await supabase.from('trinity_tasks').insert([{
            ...task,
            status: 'todo',
            priority: 4,
            created_at: new Date().toISOString()
        }]);

        if (error) console.error(`[PULSE] ❌ Failed to seed "${task.title}":`, error.message);
        else console.log(`[PULSE] ✅ Seeded: ${task.title}`);
    }
}

seedPulse();
