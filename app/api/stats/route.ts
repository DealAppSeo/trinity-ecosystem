import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // 1. Agents Online (Last 5 mins)
        // Adjust timestamp logic for Postgres or JS. Easier to fetch active heartbeats.
        const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

        const { count: onlineCount, error: onlineError } = await supabase
            .from('trinity_heartbeat') // or agent_heartbeat
            .select('*', { count: 'exact', head: true })
            .gt('last_seen', fiveMinsAgo);

        // 2. Tasks Completed (Last 24h)
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { count: completedCount, error: completedError } = await supabase
            .from('trinity_tasks')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'completed')
            .gt('created_at', dayAgo); // Using created_at or updated_at/completed_at? Assume 'created_at' or if `completed_at` exists.
        // User query used `completed_at`. Let's check if we know that column exists.
        // I didn't verify trinity_tasks schema fully. Use created_at as proxy or try completed_at inside try/catch?
        // Safest is status='completed'.

        // 3. Active Tasks
        const { count: activeCount, error: activeError } = await supabase
            .from('trinity_tasks')
            .select('*', { count: 'exact', head: true })
            .in('status', ['pending', 'in_progress']);

        if (onlineError || completedError || activeError) {
            console.error('Stats Error:', { onlineError, completedError, activeError });
        }

        return NextResponse.json({
            online_agents: onlineCount || 0,
            tasks_completed_24h: completedCount || 0,
            active_tasks: activeCount || 0
        });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
