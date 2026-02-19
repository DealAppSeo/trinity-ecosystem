/**
 * PruningEngine (Evolutionary Swarm Pruning - ESP)
 * Based on Evolutionary Swarm Pruning and Swarm Intelligence Algorithms.md
 */

import { EvolutionaryLogger, EvolutionLog } from './EvolutionaryLogger';
import { SupabaseClient } from '@supabase/supabase-js';

export interface AgentFitness {
    agentName: string;
    successRate: number;
    latency: number;
    failoverCount: number;
    score: number;
}

export class PruningEngine {
    private logger: EvolutionaryLogger;

    constructor(private supabase: SupabaseClient) {
        this.logger = new EvolutionaryLogger(supabase, 'PruningEngine');
    }

    /**
     * Evaluates agent performance and prunes the pool.
     * f(i) = w1 * success + w2 * (1/latency)
     */
    async evaluateAndPrune(agents: string[]): Promise<{ kept: string[], pruned: string[], mutated: string[] }> {
        console.log(`[ESP] 🧬 Initiating Evolutionary Swarm Pruning for ${agents.length} agents...`);

        const fitnessData: AgentFitness[] = await Promise.all(agents.map(async (name) => {
            const stats = await this.getAgentStats(name);
            // f(i) = (successRate * 0.7) + ((1 / (avgLatency || 1000)) * 300)
            const score = (stats.successRate * 0.7) + ((1 / Math.max(1, stats.avgLatency)) * 300);
            return {
                agentName: name,
                successRate: stats.successRate,
                latency: stats.avgLatency,
                failoverCount: stats.failoverCount,
                score
            };
        }));

        // Sort by score descending
        fitnessData.sort((a, b) => b.score - a.score);

        const keepCount = Math.ceil(agents.length * 0.5);
        const mutateCount = Math.floor(agents.length * 0.2);

        const kept = fitnessData.slice(0, keepCount).map(f => f.agentName);
        const mutated = fitnessData.slice(keepCount, keepCount + mutateCount).map(f => f.agentName);
        const pruned = fitnessData.slice(keepCount + mutateCount).map(f => f.agentName);

        // Log evolution
        await this.logger.recordEvolution({
            intent: 'Evolutionary Swarm Pruning',
            strategy: 'ESP v1 (50% Keep, 20% Mutate)',
            action_details: { kept, mutated, pruned, fitness: fitnessData },
            outcome: 'Success',
            effect_score: 100,
            learned_insight: `Pruned ${pruned.length} underperforming agents. Mutating ${mutated.length} for specialized tasks.`
        });

        return { kept, pruned, mutated };
    }

    private async getAgentStats(agentName: string) {
        // Query trinity_agent_logs or trinity_evolution_vault for stats
        const { data: logs } = await this.supabase
            .from('trinity_evolution_vault')
            .select('outcome, effect_score, metadata')
            .eq('agent_name', agentName)
            .limit(50);

        if (!logs || logs.length === 0) return { successRate: 0.5, avgLatency: 500, failoverCount: 0 };

        const successCount = logs.filter(l => l.outcome === 'Success').length;
        const successRate = successCount / logs.length;

        // Extract latency from metadata if available
        const latencies = logs.map(l => (l.metadata as any)?.latency || 500).filter(l => typeof l === 'number');
        const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 500;

        return {
            successRate,
            avgLatency,
            failoverCount: 0 // Placeholder
        };
    }

    /**
     * "Mutates" an agent by adjusting its provider weights or tool preferences.
     */
    async mutateAgent(agentName: string) {
        console.log(`[ESP] 🧪 Mutating agent ${agentName}...`);
        // Implementation: Adjust IntelligenceRouter weights via Redis/DB
    }
}
