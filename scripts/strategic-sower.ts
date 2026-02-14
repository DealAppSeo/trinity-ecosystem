import { supabaseAdmin as supabase } from '../lib/supabase';
import fs from 'fs';
import path from 'path';

/**
 * AUTONOMOUS STRATEGIC SOWER
 * 
 * This script reads the task.md file and seeds pending tasks into Supabase
 * to ensure agents can continue working without human intervention.
 */

async function seedNextTasks() {
    const taskMdPath = path.resolve('C:/Users/Cash4/.gemini/antigravity/brain/8a4ba8e6-f7ea-4ce7-b55f-d84f73816d4b/task.md');

    if (!fs.existsSync(taskMdPath)) {
        console.error("❌ task.md not found at expected path.");
        return;
    }

    const content = fs.readFileSync(taskMdPath, 'utf8');
    const lines = content.split('\n');

    const pendingTasks: { title: string; owner?: string; description: string }[] = [];

    // Simple parser for task.md
    let currentPhase = "";
    for (const line of lines) {
        if (line.startsWith('#')) continue;

        if (line.includes('[ ]')) {
            const taskText = line.split('[ ]')[1].trim();
            pendingTasks.push({
                title: `[PHASE 0] ${taskText}`,
                description: `Autonomous task seeded from implementation plan. \n\nTarget: ${taskText}`,
                owner: taskText.toLowerCase().includes('grok') ? 'trinity-w3c' :
                    taskText.toLowerCase().includes('claude') ? 'trinity-orch' : undefined
            });
        }
    }

    if (pendingTasks.length === 0) {
        console.log("✅ No pending tasks found to seed.");
        return;
    }

    console.log(`🌱 Seeding ${pendingTasks.length} tasks...`);

    for (const task of pendingTasks) {
        const { data, error } = await supabase.from('trinity_tasks').insert([{
            title: task.title,
            description: task.description,
            status: 'pending',
            priority: 50,
            claimed_by: task.owner,
            metadata: { source: 'strategic_sower', automated: true }
        }]);

        if (error) {
            console.error(`❌ Failed to seed "${task.title}":`, error.message);
        } else {
            console.log(`✅ Seeded: ${task.title} ${task.owner ? `(Assigned to ${task.owner})` : ''}`);
        }
    }
}

seedNextTasks().catch(console.error);
