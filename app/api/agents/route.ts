import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Force dynamic to ensure we always get partial real-time data on refresh
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // 1. Fetch Agent Registry (The Source of Truth for Status and Reputation)
        const { data: registry, error: regError } = await supabase
            .from('trinity_agent_registry')
            .select('*')
            .order('agent_name');

        if (regError) {
            console.error('Error fetching registry:', regError);
            return NextResponse.json({ error: regError.message }, { status: 500 });
        }

        // 2. Fetch Heartbeats for additional metadata if needed
        const { data: heartbeats } = await supabase
            .from('trinity_heartbeat')
            .select('*');

        const heartbeatMap = new Map((heartbeats || []).map((h: any) => [h.agent, h]));

        // 3. Map registry to UI structure
        const agents = (registry || []).map((agent: any) => {
            const hb = heartbeatMap.get(agent.agent_name);

            // Unified Liveness Check (5 mins)
            const lastActive = agent.last_active;
            const isOnline = lastActive
                ? (Date.now() - new Date(lastActive).getTime()) < 5 * 60 * 1000
                : false;

            // Derived Tiered Status for UI
            let tierStatus = isOnline ? 'active' : 'offline';
            if (isOnline && agent.status === 'idle') tierStatus = 'amber';

            return {
                ...agent,
                status: tierStatus,
                is_live: isOnline,
                last_ping: lastActive,
                group_name: agent.squad || hb?.config?.group || 'UNKNOWN',
                metadata: {
                    ...hb?.config,
                    current_task: agent.current_task_summary
                }
            };
        });

        return NextResponse.json(agents);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
