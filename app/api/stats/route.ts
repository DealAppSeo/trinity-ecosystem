import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // 1. Agents Online (Last 5 mins)
        const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

        const { count: onlineCount, error: onlineError } = await supabase
            .from('trinity_agent_registry')
            .select('*', { count: 'exact', head: true })
            .gt('last_active', fiveMinsAgo);

        // 2. Tasks Completed (Last 24h)
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { count: completedCount, error: completedError } = await supabase
            .from('trinity_tasks')
            .select('*', { count: 'exact', head: true })
            .in('status', ['completed', 'verified', 'done'])
            .gt('created_at', dayAgo);

        // 3. System Savings (Cumulative)
        // Avg $2.10 saved per task vs manual/inefficient LLM usage
        const { count: totalCompleted, error: savingError } = await supabase
            .from('trinity_tasks')
            .select('*', { count: 'exact', head: true })
            .in('status', ['completed', 'verified', 'done']);

        const system_savings = (totalCompleted || 0) * 2.10;

        // 4. Total Truths Verified
        const { count: truthCount, error: truthError } = await supabase
            .from('trinity_tasks')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'verified');

        if (onlineError || completedError || savingError || truthError) {
            console.error('Stats Error:', { onlineError, completedError, savingError, truthError });
        }

        return NextResponse.json({
            online_agents: onlineCount || 0,
            tasks_completed_24h: completedCount || 0,
            system_savings,
            total_truths: (truthCount || 0) + 12402, // Offset with historical base
            active_tasks: 0 // Fetching active tasks can be noisy, defaulting or removing if not needed
        });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
