import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Force dynamic to ensure we always get partial real-time data on refresh
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // 1. Fetch Agent Definitions (The 12 Agents)
        const { data: groups, error: groupError } = await supabase
            .from('trinity_agent_groups')
            .select('*')
            .order('group_name');

        if (groupError) {
            console.error('Error fetching groups:', groupError);
            return NextResponse.json({ error: groupError.message }, { status: 500 });
        }

        // 2. Fetch Heartbeats (Live Status)
        const { data: heartbeats, error: hbError } = await supabase
            .from('trinity_heartbeat')
            .select('*');

        if (hbError) {
            console.error('Error fetching heartbeats:', hbError);
        }

        // 3. Merge Data - robustness update
        // If groups table is empty, use heartbeats to discover agents

        type Heartbeat = {
            agent: string;
            last_seen?: string;
            last_ping?: string;
            config?: any;
            status?: string;
        };

        const heartbeatMap = new Map<string, Heartbeat>((heartbeats || []).map((h: any) => [h.agent, h]));

        // Use groups if available, otherwise derive from heartbeats
        const baseList = (groups && groups.length > 0)
            ? groups
            : (heartbeats || []).map((h: any) => ({
                agent_name: h.agent,
                group_name: h.config?.group || 'UNKNOWN',
                is_survivor: h.config?.isSurvivor || false
            }));

        // Deduplicate if deriving from heartbeats
        const uniqueAgents = Array.from(new Set(baseList.map((a: any) => a.agent_name)))
            .map(name => baseList.find((a: any) => a.agent_name === name));

        const agents = uniqueAgents.map((agent: any) => {
            const hb = heartbeatMap.get(agent.agent_name);
            const lastPing = hb?.last_seen || hb?.last_ping;

            // Online if seen in last 5 mins
            const isOnline = lastPing
                ? (Date.now() - new Date(lastPing).getTime()) < 5 * 60 * 1000
                : false;

            return {
                ...agent,
                status: isOnline ? 'active' : 'offline',
                last_ping: lastPing,
                group_name: agent.group_name || hb?.config?.group || 'UNKNOWN', // Fallback to HB config
                is_survivor: agent.is_survivor || hb?.config?.isSurvivor || false,
                metadata: hb?.config || {}
            };
        });

        return NextResponse.json(agents || []);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
