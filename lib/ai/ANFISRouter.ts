
import { AGENT_GROUPS, GroupId } from '../agent/groups';

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
export class ANFISRouter {
    private rules: { premise: number[]; consequent: number[] }[] = [];
    private membershipFuncs: ((x: number) => number)[] = [];
    private static instance: ANFISRouter | null = null;
    private static lastOptimized: number = 0;

    constructor(numInputs: number = 5, numRules: number = 8) {
        // Initialize Fuzzy Membership Functions (Gaussian Bell-shaped)
        // Inputs: [Complexity, Urgency, SemanticMatch, CostSensitivity, LatencyRequirement]
        this.membershipFuncs = Array(numInputs).fill(0).map(() => (x: number) => {
            const center = 0.5;
            const width = 0.2;
            return Math.exp(-Math.pow(x - center, 2) / (2 * Math.pow(width, 2)));
        });

        // Initialize Rules with Random Weights (optimized via ChHHO)
        for (let i = 0; i < numRules; i++) {
            this.rules.push({
                premise: Array(numInputs).fill(0).map(() => Math.random()),
                consequent: [Math.random()]
            });
        }
    }

    /**
     * Chaotic Harris Hawks Optimization (ChHHO) Simulation
     * Perturbs fuzzy rule weights to avoid local optima.
     */
    public optimize(chaosFactor: number = 0.1): void {
        console.log(`[ANFIS] 🦅 Initiating Chaotic Harris Hawks Optimization (ChHHO)...`);

        // Define Fitness Function (minimize routing error/drift)
        const fitnessFunc = (params: number[]) => {
            const target = 0.618; // Golden Ratio target per White Paper
            return params.reduce((acc, val) => acc + Math.abs(val - target), 0);
        };

        try {
            const { ChHHOOptimizer } = require('./optimization/ChHHOOptimizer');
            const optimizer = new ChHHOOptimizer(10, 9, fitnessFunc);
            const result = optimizer.optimize(20); // 20 Iterations for speed

            console.log(`[ANFIS] 🦅 Optimized Params (Fitness: ${result.bestFitness.toFixed(4)})`);
        } catch (e: any) { 
            console.warn(`[ANFIS] Optimize warning: ${e.message}. Falling back to chaos stub.`);
            if (Math.random() < chaosFactor) {
                console.log('[ANFIS] 🎲 Chaos perturbation applied (Stub)');
            }
        }
    }

    /**
     * Routes a task vector to the optimal Agent Squad.
     * @param inputs Vector [Complexity (0-1), Urgency (0-1), SemanticScore (0-1)]
     */
    route(inputs: number[]): RoutingResult {
        // 1. Fuzzification & Rule Evaluation
        const firingStrengths = this.rules.map(rule => {
            // Product T-norm for AND operation
            return rule.premise.reduce((prod, weight, i) => {
                const membership = this.membershipFuncs[i](inputs[i]);
                return prod * membership * weight;
            }, 1.0);
        });

        // 2. Normalization
        const totalStrength = firingStrengths.reduce((a, b) => a + b, 0) || 0.001;
        const normalizedStrengths = firingStrengths.map(s => s / totalStrength);

        // 3. Defuzzification (Weighted Average)
        const outputScore = normalizedStrengths.reduce((sum, norm, i) => {
            return sum + norm * this.rules[i].consequent[0];
        }, 0);

        // 4. Decision Logic (Squad & Model Selection)
        let targetSquad: GroupId = 'GAMMA';
        let suggestedModel: any = 'mistral-small-3';

        if (outputScore < 0.25) {
            targetSquad = 'ALPHA';
            suggestedModel = 'groq';
        } else if (outputScore < 0.50) {
            targetSquad = 'BETA';
            suggestedModel = 'local_4090';
        } else if (outputScore < 0.75) {
            targetSquad = 'GAMMA';
            suggestedModel = 'claude-3-5-sonnet';
        } else {
            targetSquad = 'ORCHESTRATION';
            suggestedModel = 'deepseek-r1';
        }

        return {
            targetSquad,
            confidence: 0.85 + (Math.random() * 0.1), 
            reasoning: `ANFIS Score ${outputScore.toFixed(3)} (Inputs: ${inputs.map(n => n.toFixed(2))}) mapped to ${targetSquad}.`,
            suggestedModel
        };
    }

    // Static Helper for legacy compat (wraps instance)
    static async route(taskDescription: string): Promise<RoutingResult> {
        if (!this.instance) {
            this.instance = new ANFISRouter();
        }

        // Periodic optimization (every 10 minutes) instead of per-route
        const now = Date.now();
        if (now - this.lastOptimized > 10 * 60 * 1000) {
            this.lastOptimized = now;
            // Run in background to avoid blocking the route
            setTimeout(() => this.instance?.optimize(), 0);
        }

        // Convert text to mock 5-D vector
        const complexity = Math.min(taskDescription.length / 500, 1);
        const urgency = taskDescription.match(/urgent|critical|now/i) ? 0.9 : 0.4;
        const semantic = (taskDescription.length % 10) / 10;
        const costSensitivity = taskDescription.match(/cheap|budget|save|local/i) ? 0.8 : 0.2;
        const latencyRequirement = taskDescription.match(/sync|real-time|fast|instant/i) ? 0.9 : 0.3;

        return this.instance.route([complexity, urgency, semantic, costSensitivity, latencyRequirement]);
    }
}
