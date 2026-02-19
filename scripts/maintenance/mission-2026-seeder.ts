import { supabase } from '../lib/supabase';

async function seedMission() {
    console.log('--- SEEDING MISSION: CONVERGENCE 2026 (FIXED) ---');

    const tasks = [
        // ALPHA SQUAD: RESEARCH & GOVERNANCE
        {
            title: '[RESEARCH] 2026 Blue Ocean Scan: AI + Web3 Convergence',
            description: 'Search for the best opportunities at the convergence of AI and Web3 for 2026. Focus on niche markets where viral growth loops are nascent.',
            status: 'pending',
            priority: 95,
            task_type: 'research',
            assigned_to: 'trinity-veritas',
            requires_consensus: true,
            metadata: { consensus_group: 'ALPHA' }
        },
        {
            title: '[GOVERNANCE] Ethical Viral Loop Guidelines v1.0',
            description: 'Define the constitutional boundaries for viral loop campaigns. Ensure they align with the Golden Rule and avoid exploitative psychology.',
            status: 'pending',
            priority: 90,
            task_type: 'report',
            assigned_to: 'trinity-gcm',
            requires_consensus: true,
            metadata: { consensus_group: 'ALPHA' }
        },

        // GAMMA SQUAD: ENGINEERING & DATA (Previously failed)
        {
            title: '[ENGINEERING] AI Assistant Prototype: Viral Hook Integration',
            description: 'Code the core logic for a viral loop baked into a product design. Implement a "Proof of Invitation" mechanism using basic Web3 logic.',
            status: 'pending',
            priority: 92,
            task_type: 'code',
            assigned_to: 'trinity-hdm',
            requires_consensus: true,
            metadata: { consensus_group: 'GAMMA' }
        }
    ];

    for (const task of tasks) {
        const { data, error } = await supabase
            .from('trinity_tasks')
            .insert(task)
            .select();

        if (error) {
            console.error(`Error seeding task "${task.title}":`, error.message);
        } else {
            console.log(`Seeded: ${task.title} (ID: ${data[0].id})`);
        }
    }

    console.log('--- MISSION 2026 SEEDING (FIXED) COMPLETE ---');
}

seedMission();
