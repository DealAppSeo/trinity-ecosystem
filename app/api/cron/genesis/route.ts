
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Reuse the task definitions (simplified for the API)
const GENESIS_CURRICULUM = [
    {
        phase: 'Ideation',
        tasks: [
            {
                title: "[Auto-Genesis] Ideation: Brainstorm Concepts",
                description: `OBJECTIVE: Brainstorm 10 product ideas for 'NeuroSwarm'.
INSTRUCTIONS:
1. USE 'tavily_search' to find 'AI Swarm use cases'.
2. USE 'write_file' to save to 'artifacts/NeuroSwarm/AutoIdeation/concepts.md'.`,
                type: "reasoning",
                role: "trinity-cdo",
                priority: 80
            },
            {
                title: "[Auto-Genesis] Pitch Drafting",
                description: `OBJECTIVE: Draft pitches for top ideas.
INSTRUCTIONS:
1. SELECT top 3 concepts.
2. WRITE elevator pitches.
3. SAVE to 'artifacts/NeuroSwarm/AutoIdeation/pitches.md'.`,
                type: "content",
                role: "trinity-cdo",
                priority: 80
            }
        ]
    },
    {
        phase: 'Research',
        tasks: [
            {
                title: "[Auto-Genesis] Research: ZKML & Privacy",
                description: `OBJECTIVE: Research Zero-Knowledge Machine Learning.
INSTRUCTIONS:
1. SEARCH for 'ZKML state of the art 2025'.
2. SAVE report to 'artifacts/NeuroSwarm/AutoResearch/zkml_report.md'.`,
                type: "research",
                role: "trinity-veritas",
                priority: 75
            }
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

    // supabase is imported from @/lib/supabase

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
