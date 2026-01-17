import { supabase } from '../lib/supabase';

async function maintenance() {
    console.log('--- STARTING TASK MAINTENANCE ---');

    // 1. Reset stagnant 'in_progress' tasks (older than 30 mins)
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: stagnant, error: resetErr } = await supabase
        .from('trinity_tasks')
        .update({ status: 'pending', claimed_by: null, started_at: null })
        .eq('status', 'in_progress')
        .lt('updated_at', thirtyMinsAgo)
        .select();

    if (resetErr) console.error('Reset error:', resetErr.message);
    else console.log(`Reset ${stagnant?.length || 0} stagnant tasks.`);

    // 2. Seed a Triad Consensus Task
    console.log('Seeding Triad Consensus Task...');
    const { data: task, error: seedErr } = await supabase
        .from('trinity_tasks')
        .insert({
            title: '[TRIAD] Trinity Ecosystem Alignment Audit',
            description: 'Evaluate the current system state, naming standardization, and dashboard accuracy. Requires ALPHA squad consensus.',
            status: 'pending',
            priority: 80,
            task_type: 'report',
            requires_consensus: true,
            consensus_group: 'ALPHA',
            assigned_to: 'trinity-orch' // Orch starts it, others will sign
        })
        .select()
        .single();

    if (seedErr) console.error('Seed error:', seedErr.message);
    else console.log(`Seeded Triad Task ID: ${task.id}`);

    console.log('--- MAINTENANCE COMPLETE ---');
}

maintenance();
