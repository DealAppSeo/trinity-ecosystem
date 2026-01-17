
import { AgentConfig } from '../agent/types';

// Mirroring OpenAPI schema
export interface AnfisInput {
    latency_ms: number;
    user_reputation: number;
    task_complexity: number;
    user_preference_accuracy?: number; // 0-1
    timeout_ms?: number;
}

export interface AnfisOutput {
    should_query_user: boolean;
    interaction_type: 'none' | 'shallow_check' | 'deep_clarification' | 'email_notification' | 'sms_notification';
    score: number;
    reason: string;
}

export interface GnnInput {
    task_embedding: number[];
    candidate_node_ids: string[];
}

export interface GnnOutput {
    ranked_ids: string[];
    scores: number[];
}

export interface RewardConfig {
    weights: Record<string, number>;
}

export class ScienceClient {
    private baseUrl: string;
    private fallbackMode: boolean = false;

    constructor(baseUrl: string | null = null) {
        this.baseUrl = baseUrl || process.env.NEXT_PUBLIC_TRINITY_SCIENCE_URL || 'http://127.0.0.1:8000';
    }

    /**
     * Update the ANFIS Reward Configuration (God Mode).
     */
    async updateRewardConfig(config: RewardConfig): Promise<RewardConfig> {
        try {
            const res = await fetch(`${this.baseUrl}/anfis/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });

            if (!res.ok) throw new Error("Failed to update reward config");
            return await res.json() as RewardConfig;
        } catch (error) {
            console.error("🧪 Update Reward Config Failed:", error);
            throw error;
        }
    }

    /**
     * Ask the Science Brain for a decision (ANFIS).
     * Falls back to local heuristic if service is down.
     */
    async decide(input: AnfisInput): Promise<AnfisOutput> {
        if (this.fallbackMode) return this.localFallback(input, "Fallback Mode Active");

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), input.timeout_ms || 5000);

            const res = await fetch(`${this.baseUrl}/anfis/decide`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!res.ok) {
                throw new Error(`Science API Error: ${res.statusText}`);
            }

            return await res.json() as AnfisOutput;

        } catch (error) {
            console.error("🧪 Science Brain Disconnected (Switching to Reflexes):", error);
            // Optional: Enable sticky fallback mode if we want to avoid retrying immediately
            // this.fallbackMode = true; 
            return this.localFallback(input, `Connection Failed: ${(error as Error).message}`);
        }
    }

    /**
     * Rank items using Graphic Neural Network logic.
     */
    async rank(input: GnnInput): Promise<GnnOutput> {
        try {
            const res = await fetch(`${this.baseUrl}/gnn/rank`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input)
            });

            if (!res.ok) throw new Error("GNN Rank failed");
            return await res.json() as GnnOutput;
        } catch (error) {
            console.error("🧪 GNN Rank Failed:", error);
            // Fallback: Return original order
            return {
                ranked_ids: input.candidate_node_ids,
                scores: input.candidate_node_ids.map(() => 0)
            };
        }
    }

    /**
     * Local "Spinal Cord" logic when Brain is offline.
     * Simple reflex to keep system moving.
     */
    private localFallback(input: AnfisInput, reasonPrefix: string): AnfisOutput {
        const score = (input.task_complexity * 0.5) + (input.user_reputation * 0.5);
        // Simple safe heuristic
        if (score > 80) {
            return {
                should_query_user: true,
                interaction_type: 'shallow_check',
                score,
                reason: `[Offline Reflex] ${reasonPrefix}. High complexity detected.`
            };
        }
        return {
            should_query_user: false,
            interaction_type: 'none',
            score,
            reason: `[Offline Reflex] ${reasonPrefix}. Proceeding standard.`
        };
    }
}
