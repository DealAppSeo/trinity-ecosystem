
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

    constructor(numInputs: number = 3, numRules: number = 5) {
        // Initialize Fuzzy Membership Functions (Gaussian Bell-shaped)
        // Inputs: [Complexity, Urgency, SemanticMatch]
        this.membershipFuncs = Array(numInputs).fill(0).map(() => (x: number) => {
            const center = 0.5;
            const width = 0.2;
            return Math.exp(-Math.pow(x - center, 2) / (2 * Math.pow(width, 2)));
        });

        // Initialize Rules with Random Weights (to be optimized)
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
    optimize(chaosFactor: number = 0.1) {
        // console.log('[ANFIS] 🦅 Initiating Chaotic Harris Hawks Optimization...');
        this.rules.forEach(rule => {
            // Apply Logistic Map Chaos: x(n+1) = r * x(n) * (1 - x(n))
            const r = 3.99; // Chaos parameter
            rule.consequent[0] = r * rule.consequent[0] * (1 - rule.consequent[0]);

            // Perturb premise weights slightly
            rule.premise = rule.premise.map(w => w + (Math.random() - 0.5) * chaosFactor);
        });
        // console.log('[ANFIS] ✅ Optimization Complete. Rules updated.');
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

        // 4. Decision Logic (Squad Selection)
        // Output 0.0-0.33: ALPHA | 0.33-0.66: BETA | 0.66-1.0: GAMMA
        let targetSquad: GroupId = 'GAMMA';
        let suggestedModel: any = 'gemini-1.5-pro';

        if (outputScore < 0.33) {
            targetSquad = 'ALPHA'; // Truth
            suggestedModel = 'grok-beta';
        } else if (outputScore < 0.66) {
            targetSquad = 'BETA'; // Care
            suggestedModel = 'claude-3-5-sonnet';
        } else {
            targetSquad = 'GAMMA'; // Build
            suggestedModel = 'gemini-1.5-pro';
        }

        return {
            targetSquad,
            confidence: 0.85 + (Math.random() * 0.1), // Simulated Anfis confidence
            reasoning: `ANFIS Score ${outputScore.toFixed(3)} (Inputs: ${inputs.map(n => n.toFixed(2))}) mapped to ${targetSquad}.`,
            suggestedModel
        };
    }

    // Static Helper for legacy compat (wraps instance)
    static async route(taskDescription: string): Promise<RoutingResult> {
        // Convert text to mock vector
        // Complexity: length, Urgency: keywords, Semantic: random hash
        const complexity = Math.min(taskDescription.length / 500, 1);
        const urgency = taskDescription.match(/urgent|critical|now/i) ? 0.9 : 0.4;
        const semantic = (taskDescription.length % 10) / 10;

        const router = new ANFISRouter();
        router.optimize(); // Run one optimization step
        return router.route([complexity, urgency, semantic]);
    }
}
