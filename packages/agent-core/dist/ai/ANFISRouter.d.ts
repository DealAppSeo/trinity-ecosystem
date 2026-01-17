import { GroupId } from '../agent/groups';
export interface RoutingResult {
    targetSquad: GroupId;
    confidence: number;
    reasoning: string;
    suggestedModel?: 'grok-beta' | 'claude-3-5-sonnet' | 'gemini-1.5-pro';
}
/**
 * ANFIS (Adaptive Neuro-Fuzzy Inference System) Router
 *
 * In V2, this utilizes Semantic RAG (via vector store) to route tasks.
 * Currently running in "Heuristic Mode" until embeddings are live.
 */
/**
 * Advanced ANFIS Router (Antigravity V3)
 * Implements Adaptive Neuro-Fuzzy Inference System with Chaotic Optimization.
 */
export declare class ANFISRouter {
    private rules;
    private membershipFuncs;
    constructor(numInputs?: number, numRules?: number);
    /**
     * Chaotic Harris Hawks Optimization (ChHHO) Simulation
     * Perturbs fuzzy rule weights to avoid local optima.
     */
    optimize(chaosFactor?: number): void;
    /**
     * Routes a task vector to the optimal Agent Squad.
     * @param inputs Vector [Complexity (0-1), Urgency (0-1), SemanticScore (0-1)]
     */
    route(inputs: number[]): RoutingResult;
    static route(taskDescription: string): Promise<RoutingResult>;
}
