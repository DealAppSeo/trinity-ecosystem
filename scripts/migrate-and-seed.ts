import { supabase } from '../lib/supabase';

async function run() {
    console.log('--- STARTING MIGRATION & SEEDING ---');

    // 1. Change Column Type
    const { error: alterErr } = await supabase.rpc('exec_sql', {
        query: "ALTER TABLE trinity_tasks ALTER COLUMN consensus_group TYPE text"
    });

    if (alterErr) {
        if (alterErr.message.includes('timeout')) {
            console.warn('Migration timed out, but proceeding to seed anyway as column might have changed or we can use metadata.');
        } else {
            console.error('Migration error:', alterErr.message);
        }
    } else {
        console.log('Successfully changed consensus_group to text');
    }

    // 2. Seed Triad Task
    const { data: task, error: seedErr } = await supabase
        .from('trinity_tasks')
        .insert({
            title: '[TRIAD] Trinity Ecosystem Alignment Audit',
            description: 'Evaluate the current system state, naming standardization, and dashboard accuracy. Requires ALPHA squad consensus.',
            status: 'pending',
            priority: 95,
            task_type: 'report',
            requires_consensus: true,
            consensus_group: 'ALPHA',
            assigned_to: 'trinity-orch'
        })
        .select()
        .single();

    if (seedErr) {
        console.error('Seed error:', seedErr.message);
        // Fallback: seed without consensus_group if it's still UUID
        if (seedErr.message.includes('uuid')) {
            console.log('Retrying seed without consensus_group column...');
            await supabase.from('trinity_tasks').insert({
                title: '[TRIAD] Trinity Ecosystem Alignment Audit (Fallback)',
                description: 'Requires ALPHA squad consensus. (Failsafe)',
                status: 'pending',
                priority: 95,
                task_type: 'report',
                metadata: { requires_consensus: true, consensus_group: 'ALPHA' },
                assigned_to: 'trinity-orch'
            });
        }
    } else {
        console.log(`Seeded Triad Task ID: ${task.id}`);
    }

    console.log('--- MIGRATION & SEEDING COMPLETE ---');
}

run();
