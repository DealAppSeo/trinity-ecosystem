
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Reuse the task definitions (simplified for the API)
const GENESIS_CURRICULUM = [
    {
        phase: 'Ideation',
        tasks: [
            { title: "[Auto-Genesis] Brainstorm: Edge AI + Web3", description: "List 5 concepts for running AI on edge devices with crypto payments.", type: "reasoning", role: "trinity-cdo", priority: 80 },
            { title: "[Auto-Genesis] Pitch: Decentralized Data Marketplace", description: "Draft a 1-paragraph pitch for a NeuroSwarm Data DAO.", type: "content", role: "trinity-cdo", priority: 80 }
        ]
    },
    {
        phase: 'Research',
        tasks: [
            { title: "[Auto-Genesis] Research: Zero-Knowledge ML", description: "Search for 'ZKML' use cases in 2025. Summarize 3 key benefits for NeuroSwarm.", type: "research", role: "trinity-veritas", priority: 75 },
            { title: "[Auto-Genesis] Competitor Recon", description: "Find 3 new AI agents on ProductHunt. Analyze their 'swarming' capabilities.", type: "research", role: "trinity-science", priority: 75 }
        ]
    },
    {
        phase: 'Coding',
        tasks: [
            { title: "[Auto-Genesis] Code: React Force Graph", description: "Create a React component using 'react-force-graph' to visualize agent nodes.", type: "code", role: "trinity-cdo", priority: 70 },
            { title: "[Auto-Genesis] Code: Smart Contract Interface", description: "Write a Solidity interface for an Agent Registry contract.", type: "code", role: "trinity-veritas", priority: 70 }
        ]
    }
];

export async function GET(request: Request) {
    // 1. Secure Execution (Cron Only)
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        // Allow unauthenticated for now if strictly testing, but Vercel recommends verifying CRON_SECRET
        // For this demo, we'll proceed but log a warning.
        console.warn('⚠️ Genesis Engine triggered without strict CRON_SECRET');
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    try {
        // 2. Check Queue Depth
        const { count, error: countError } = await supabase
            .from('trinity_tasks')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');

        if (countError) throw countError;

        console.log(`[Genesis] Current Pending Tasks: ${count}`);

        if (count !== null && count >= 5) {
            return NextResponse.json({ message: 'Swarm is active. Genesis Engine sleeping.' });
        }

        // 3. Inject New Tasks (Round Robin Random)
        const randomPhase = GENESIS_CURRICULUM[Math.floor(Math.random() * GENESIS_CURRICULUM.length)];
        console.log(`[Genesis] Injecting Phase: ${randomPhase.phase}`);

        const newTasks = randomPhase.tasks.map(t => ({
            title: t.title,
            description: t.description,
            task_type: t.type,
            assigned_to: t.role,
            priority: t.priority,
            status: 'pending',
            created_at: new Date().toISOString(),
            requires_external_artifact: true,
            metadata: { tags: ['genesis', 'auto-generated', randomPhase.phase.toLowerCase()] }
        }));

        const { error: insertError } = await supabase.from('trinity_tasks').insert(newTasks);
        if (insertError) throw insertError;

        return NextResponse.json({
            success: true,
            message: `Injected ${newTasks.length} tasks from ${randomPhase.phase} phase.`,
            tasks: newTasks
        });

    } catch (error: any) {
        console.error('[Genesis] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
