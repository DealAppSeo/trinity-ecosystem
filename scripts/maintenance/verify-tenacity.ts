import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function verifyTenacity() {
    console.log('--- 🛡️ ALPHA TENACITY VERIFICATION ---');

    // 1. Seed a Mock Problematic Task
    const { data: task, error: seedError } = await supabase
        .from('trinity_tasks')
        .insert({
            title: '[EVERGREEN] Tenacity & Learning Test v1',
            description: 'System-wide test of provider failure recovery and evergreen duplication logic. Agent should attempt multiple providers if one stalls.',
            task_type: 'research',
            priority: 95,
            status: 'pending',
            metadata: {
                test_case: 'tenacity_v1',
                completed_by_list: []
            }
        })
        .select()
        .single();

    if (seedError) {
        console.error('❌ Failed to seed test task:', seedError.message);
        return;
    }

    console.log(`✅ Seeded test task ${task.id}.`);
    console.log('⏳ Waiting for swarm to pick up and process (checking results in 60s)...');

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 60000));

    // 2. Check Results
    const { data: processedTask, error: fetchError } = await supabase
        .from('trinity_tasks')
        .select('*')
        .eq('id', task.id)
        .single();

    if (fetchError) {
        console.error('❌ Failed to fetch processed task:', fetchError.message);
        return;
    }

    console.log(`📊 Task ${task.id} Status: ${processedTask.status}`);
    if (processedTask.status === 'done' || processedTask.status === 'verified') {
        console.log('✅ TENACITY SUCCESS: Task completed through failure-recovery pipeline.');

        // Check for Evergreen Clone
        const { data: clones } = await supabase
            .from('trinity_tasks')
            .select('id')
            .ilike('title', processedTask.title)
            .neq('id', task.id);

        if (clones && clones.length > 0) {
            console.log(`✅ EVERGREEN SUCCESS: Spawned ${clones.length} duplicate(s) for next agent.`);
        } else {
            console.warn('⚠️ EVERGREEN WARNING: No duplicate found yet. Verification might be delayed.');
        }
    } else {
        console.warn(`⚠️ Task still in status: ${processedTask.status}. Check logs/swarm/ for stalling info.`);
    }

    console.log('--- VERIFICATION COMPLETE ---');
}

verifyTenacity();
