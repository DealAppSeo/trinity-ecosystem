
import { SupabaseClient } from '@supabase/supabase-js';
import { Task } from './types';

export interface EvolutionLog {
    agent_name?: string;
    task_id?: string;
    intent: string;      // What we wanted to achieve
    strategy: string;    // The method/provider/tool chosen
    action_details: any; // Raw data of what happened
    outcome: string;     // Result (Success/Failure)
    effect_score: number; // 0-100 (Based on verification/evaluation)
    learned_insight: string; // The "Moral of the story"
    metadata?: any;
}

export class EvolutionaryLogger {
    private supabase: SupabaseClient;
    private agentName: string;

    constructor(supabase: SupabaseClient, agentName: string) {
        this.supabase = supabase;
        this.agentName = agentName;
    }

    /**
     * Logs a deep evolutionary insight.
     * Uses a dedicated table and pushes large payloads to storage if needed.
     */
    async recordEvolution(log: EvolutionLog) {
        const timestamp = new Date().toISOString();
        console.log(`[EVOLUTION] 🧬 Recording learning for ${this.agentName}: ${log.intent.substring(0, 50)}...`);

        try {
            // 1. Prepare Payload
            const payload = {
                ...log,
                agent_name: this.agentName,
                created_at: timestamp,
                version: 'v9.learning'
            };

            // 2. Primary Database Entry (Indexing for retrieval)
            const { error: dbError } = await this.supabase
                .from('trinity_evolution_vault')
                .insert({
                    agent_name: this.agentName,
                    task_id: log.task_id,
                    intent: log.intent,
                    effect_score: log.effect_score,
                    outcome: log.outcome,
                    insight: log.learned_insight,
                    created_at: timestamp,
                    metadata: log.metadata || {}
                });

            if (dbError) {
                console.warn(`[EVOLUTION] ⚠️ Vault index failed: ${dbError.message}`);
                // Fallback to standard logs if vault table is missing
                await this.fallbackToStandardLog(log);
            }

            // 3. Large Payload Storage (The "Large/Slow" layer)
            // Save the full JSON to storage for deep analysis later
            const path = `evolution/${this.agentName}/${new Date().getFullYear()}/${Date.now()}_insight.json`;
            await this.supabase
                .storage
                .from('trinity-evolution-history')
                .upload(path, JSON.stringify(payload, null, 2), {
                    contentType: 'application/json',
                    upsert: true
                });

        } catch (error: any) {
            console.error(`[EVOLUTION] 🚨 Recording failed:`, error.message);
        }
    }

    private async fallbackToStandardLog(log: EvolutionLog) {
        try {
            await this.supabase
                .from('trinity_agent_logs')
                .insert({
                    agent_name: this.agentName,
                    action: 'evolution_insight',
                    message: `[LEARNING] ${log.intent} -> ${log.learned_insight}`,
                    metadata: {
                        cause: log.intent,
                        strategy: log.strategy,
                        effect: log.outcome,
                        score: log.effect_score
                    }
                });
        } catch (e) { }
    }

    /**
     * Retrieves recent successful strategies for a given intent.
     */
    async queryBestStrategies(intentKeywords: string[]): Promise<string[]> {
        // [PHASE 12] Future implementation for RAG-style strategy retrieval
        return [];
    }
}
