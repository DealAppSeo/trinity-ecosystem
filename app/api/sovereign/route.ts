import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase';
import { mcpManager } from '@/lib/mcp/MCPManager';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // 1. Fetch Railway Health via MCP
        let infraHealth = { status: 'unknown', services: [] };
        try {
            const result = await mcpManager.routeToolCall('get_infrastructure_health', {});
            infraHealth = JSON.parse(result);
        } catch (e) {
            console.warn('[SovereignAPI] Failed to fetch infra health:', e);
        }

        // 2. Fetch Latest Governance Events
        const { data: govLogs } = await supabase
            .from('trinity_agent_logs')
            .select('*')
            .ilike('message', '%CONSTITUTIONAL%')
            .order('created_at', { ascending: false })
            .limit(10);

        // 3. Fetch HITL / Pending Clarification Count
        const { count: hitlCount } = await supabase
            .from('trinity_tasks')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending_clarification');

        // 4. Graph Summary (Simulated for now, or via MCP if implemented)
        const graphSummary = {
            nodes: 24, // Mock
            relationships: 56, // Mock
            last_sync: new Date().toISOString()
        };

        return NextResponse.json({
            infra: infraHealth,
            governance: {
                recent_events: govLogs || [],
                hitl_pending: hitlCount || 0
            },
            graph: graphSummary,
            timestamp: new Date().toISOString()
        });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
