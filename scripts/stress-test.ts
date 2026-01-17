import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(url, key);

async function runStressTest() {
    console.log('--- [TRINITY PRODUCTION STRESS TEST] ---');
    console.log('Objective: Verify cross-agent artifact chain.');

    // 1. Create a chain of 3 tasks
    const testId = `stress-${Date.now().toString().slice(-4)}`;

    const tasks = [
        {
            title: `[STRESS] Phase A: Market Research (${testId})`,
            description: "Research 3 tokenized real estate competitors. Focus on TVL and market cap.",
            task_type: 'research',
            assigned_to: 'trinity-sophia',
            status: 'pending',
            priority: 100,
            is_real: true
        },
        {
            title: `[STRESS] Phase B: Design Wireframe (${testId})`,
            description: "Based on the research from Phase A, suggest a UI layout for a competitive dashboard.",
            task_type: 'design',
            assigned_to: 'trinity-mel',
            status: 'pending',
            priority: 99,
            is_real: true
        },
        {
            title: `[STRESS] Phase C: Tech Review (${testId})`,
            description: "Review the suggested design and research. Draft a implementation plan for a Next.js component.",
            task_type: 'code',
            assigned_to: 'trinity-nexus',
            status: 'pending',
            priority: 98,
            is_real: true
        }
    ];

    console.log(`Injecting ${tasks.length} tasks into the swarm (Serialized)...`);

    for (const task of tasks) {
        const { data, error } = await supabase.from('trinity_tasks').insert(task).select();
        if (error) {
            console.error(`❌ Failed to inject task "${task.title}":`, error.message);
        } else {
            console.log(`✅ Injected: ${task.title} (ID: ${data?.[0]?.id})`);
        }
    }

    console.log('--- [MONITORING MODE] ---');
    console.log(`Watch the dashboard or run 'npx tsx scripts/check-task-updates.ts' to track progress.`);
}

runStressTest();
