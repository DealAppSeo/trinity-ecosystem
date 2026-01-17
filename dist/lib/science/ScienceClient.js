"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScienceClient = void 0;
class ScienceClient {
    constructor(baseUrl = null) {
        this.fallbackMode = false;
        this.baseUrl = baseUrl || process.env.NEXT_PUBLIC_TRINITY_SCIENCE_URL || 'http://127.0.0.1:8000';
    }
    /**
     * Update the ANFIS Reward Configuration (God Mode).
     */
    async updateRewardConfig(config) {
        try {
            const res = await fetch(`${this.baseUrl}/anfis/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            if (!res.ok)
                throw new Error("Failed to update reward config");
            return await res.json();
        }
        catch (error) {
            console.error("🧪 Update Reward Config Failed:", error);
            throw error;
        }
    }
    /**
     * Ask the Science Brain for a decision (ANFIS).
     * Falls back to local heuristic if service is down.
     */
    async decide(input) {
        if (this.fallbackMode)
            return this.localFallback(input, "Fallback Mode Active");
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
            return await res.json();
        }
        catch (error) {
            console.error("🧪 Science Brain Disconnected (Switching to Reflexes):", error);
            // Optional: Enable sticky fallback mode if we want to avoid retrying immediately
            // this.fallbackMode = true; 
            return this.localFallback(input, `Connection Failed: ${error.message}`);
        }
    }
    /**
     * Rank items using Graphic Neural Network logic.
     */
    async rank(input) {
        try {
            const res = await fetch(`${this.baseUrl}/gnn/rank`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input)
            });
            if (!res.ok)
                throw new Error("GNN Rank failed");
            return await res.json();
        }
        catch (error) {
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
    localFallback(input, reasonPrefix) {
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
exports.ScienceClient = ScienceClient;
