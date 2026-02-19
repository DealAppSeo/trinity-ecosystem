import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });


async function seedEasyTasks() {
    console.log('🌱 Seeding [SUPER-EASY] Artifact Tasks...');

    // Dynamic import to ensure dotenv.config() has run
    const { supabaseAdmin: supabase } = await import('../lib/supabase');

    const tasks = [
        {
            title: '[EASY] Create a Welcome Artifact',
            description: 'Provide a brief greeting and overview of your current status as an agent in the Trinity ecosystem. Create a markdown artifact named welcome_artifact.md.',
            task_type: 'artifact_creation',
            assigned_to: 'trinity-veritas',
            priority: 10,
            status: 'pending',
            metadata: { easy: true, type: 'welcome' }
        },
        {
            title: '[EASY] Generate a Project Summary Artifact',
            description: 'Summarize the current project structure and main directories. Create a markdown artifact named project_summary.md.',
            task_type: 'artifact_creation',
            assigned_to: 'trinity-orch',
            priority: 10,
            status: 'pending',
            metadata: { easy: true, type: 'summary' }
        },
        {
            title: '[EASY] Create a System Health Report Artifact',
            description: 'Check the connection status of the agent registry and report on active agents. Create a markdown artifact named health_report.md.',
            task_type: 'artifact_creation',
            assigned_to: 'trinity-apm',
            priority: 10,
            status: 'pending',
            metadata: { easy: true, type: 'health' }
        }
    ];

    for (const task of tasks) {
        const { data, error } = await supabase.from('trinity_tasks').insert(task).select();
        if (error) {
            console.error(`❌ Failed to seed task "${task.title}":`, error.message);
        } else {
            console.log(`✅ Seeded task: ${task.title} (ID: ${data[0].id})`);
        }
    }

    console.log('🚀 Seeding complete.');
}

seedEasyTasks();
