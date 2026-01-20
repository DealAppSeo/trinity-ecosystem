import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // 1. Active Agents (last_active < 5 min, status = 'active')
        const { data: agents, error: agentsError } = await supabase
            .from('trinity_agent_registry')
            .select('agent_name, status, last_active, reputation_score, current_tier, squad, current_task_summary')
            .gte('last_active', new Date(Date.now() - 5 * 60 * 1000).toISOString())
            .eq('status', 'online'); // SSOT: UI/API should look for 'online'

        if (agentsError) throw agentsError;

        const activeCount = agents?.length || 0;

        // 2. Verification Backlog (Antigravity v8.0: 'done' but verify_count < 3)
        const { count: backlogCount, error: backlogError } = await supabase
            .from('trinity_tasks')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'done')
            .lt('verify_count', 3);

        if (backlogError) throw backlogError;

        // 3. Recent Artifacts & Consensus (last 24h)
        const { data: recentArtifacts, error: artifactError } = await supabase
            .from('trinity_artifacts')
            .select('id, title, artifact_type, creator_agent, created_at, status')
            .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .order('created_at', { ascending: false })
            .limit(20);

        if (artifactError) throw artifactError;

        // 4. BFT Statistics
        const verifiedCount = (recentArtifacts || []).filter(a => a.status === 'verified').length;
        const failedCount = (recentArtifacts || []).filter(a => a.status === 'failed').length;

        // 5. Squad Health Summary
        const squadHealth = (agents || []).reduce((acc: any, agent: any) => {
            acc[agent.squad || 'UNKNOWN'] = (acc[agent.squad || 'UNKNOWN'] || 0) + 1;
            return acc;
        }, {});

        // 6. Antigravity Health Score (Weighted by Consensus)
        const currentBacklog = backlogCount || 0;
        const healthScore = Math.min(100,
            (activeCount / 12) * 50 +                  // % of expected agents active
            (currentBacklog < 5 ? 30 : currentBacklog < 15 ? 15 : 0) + // Low backlog = high score
            (verifiedCount > 0 ? 10 : 0) -             // Recent verifications are bonus
            (failedCount * 5)                          // Failures are penalty
        );

        return NextResponse.json({
            timestamp: new Date().toISOString(),
            active_agents: activeCount,
            total_registered: 12,
            verification_backlog: currentBacklog,
            bft_stats: {
                recent_verified: verifiedCount,
                recent_failed: failedCount,
                consensus_reached: verifiedCount > 0
            },
            squad_health: squadHealth,
            health_score: Math.max(0, Math.round(healthScore)),
            pillar: 'ImageBearer Phase 11',
            consensus_mode: verifiedCount > 0 ? 'BFT_ACTIVE' : 'POLLING',
            status_summary: healthScore > 85 ? 'HyperDAG Optimal' : healthScore > 60 ? 'Healthy' : healthScore > 30 ? 'Degraded' : 'Critical',
            details: {
                agents: agents?.map(a => ({
                    name: a.agent_name,
                    squad: a.squad,
                    rep_id: a.reputation_score,
                    tier: a.current_tier,
                    last_active: a.last_active,
                    current_task: a.current_task_summary,
                    is_live: new Date(a.last_active) > new Date(Date.now() - 5 * 60 * 1000)
                })),
                recent_artifacts_sample: recentArtifacts?.map(a => ({
                    title: a.title,
                    type: a.artifact_type,
                    creator: a.creator_agent,
                    created_at: a.created_at,
                    status: a.status
                }))
            }
        }, { status: 200 });
    } catch (error: any) {
        console.error('[SWARM-HEALTH] Error:', error.message);
        return NextResponse.json(
            { error: 'Failed to fetch swarm health', details: error.message },
            { status: 500 }
        );
    }
}
