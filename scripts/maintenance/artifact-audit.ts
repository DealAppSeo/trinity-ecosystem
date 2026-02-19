import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function auditArtifacts() {
    console.log('--- [ARTIFACT GENERATION AUDIT] ---');

    // 1. Get total count and types
    const { data: artifacts, error } = await supabase
        .from('trinity_artifacts')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching artifacts:', error.message);
        return;
    }

    console.log(`Total Artifacts Found: ${artifacts.length}`);

    const stats: Record<string, number> = {};
    artifacts.forEach(a => {
        const type = a.artifact_type || 'unknown';
        stats[type] = (stats[type] || 0) + 1;
    });

    console.log('--- Breakdown by Type ---');
    Object.entries(stats).forEach(([type, count]) => {
        console.log(`${type.padEnd(12)}: ${count}`);
    });

    console.log('\n--- Recent Activity ---');
    artifacts.slice(0, 10).forEach(a => {
        console.log(`[${a.artifact_type}] ${a.title} | Task: ${a.task_id}`);
    });

    // 2. Check for missing associations (tasks without artifacts)
    const { data: recentTasks } = await supabase
        .from('trinity_tasks')
        .select('id, title, status, completed_by')
        .eq('status', 'done')
        .limit(20);

    console.log('\n--- Task-Artifact Association Check (Done Tasks) ---');
    recentTasks?.forEach(task => {
        const hasArtifact = artifacts.some(a => String(a.task_id) === String(task.id));
        console.log(`[${hasArtifact ? '✅' : '❌'}] Task ${task.id}: ${task.title} (by ${task.completed_by})`);
    });
}

auditArtifacts();
