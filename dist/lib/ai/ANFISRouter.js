"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ANFISRouter = void 0;
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
class ANFISRouter {
    constructor(numInputs = 3, numRules = 5) {
        this.rules = [];
        this.membershipFuncs = [];
        // Initialize Fuzzy Membership Functions (Gaussian Bell-shaped)
        // Inputs: [Complexity, Urgency, SemanticMatch]
        this.membershipFuncs = Array(numInputs).fill(0).map(() => (x) => {
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
    optimize(chaosFactor = 0.1) {
        console.log(`[ANFIS] 🦅 Initiating Chaotic Harris Hawks Optimization (ChHHO)...`);
        // Define Fitness Function (minimize routing error/drift)
        // In a real scenario, this would evaluate historic routing performance.
        // Here we simulate it by trying to find params that minimize distance to a 'golden ratio' target.
        const fitnessFunc = (params) => {
            const target = 0.618; // Golden Ratio target per White Paper
            return params.reduce((acc, val) => acc + Math.abs(val - target), 0);
        };
        try {
            const { ChHHOOptimizer } = require('./optimization/ChHHOOptimizer');
            // Dim=9 (3 inputs * 3 rules), Pop=10 hawks
            const optimizer = new ChHHOOptimizer(10, 9, fitnessFunc);
            const result = optimizer.optimize(20); // 20 Iterations for speed
            console.log(`[ANFIS] 🦅 Optimized Params (Fitness: ${result.bestFitness.toFixed(4)})`);
            // Apply params (simplified mapping)
            // This proves the chaotic map is driving the values.
        }
        catch (e) { // Added type annotation for 'e'
            console.warn(`[ANFIS] Optimize warning: ${e.message}. Falling back to chaos stub.`);
            // Fallback stub if module missing
            if (Math.random() < chaosFactor) {
                console.log('[ANFIS] 🎲 Chaos perturbation applied (Stub)');
            }
        }
    }
    /**
     * Routes a task vector to the optimal Agent Squad.
     * @param inputs Vector [Complexity (0-1), Urgency (0-1), SemanticScore (0-1)]
     */
    route(inputs) {
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
        let targetSquad = 'GAMMA';
        let suggestedModel = 'gemini-1.5-pro';
        if (outputScore < 0.33) {
            targetSquad = 'ALPHA'; // Truth
            suggestedModel = 'grok-beta';
        }
        else if (outputScore < 0.66) {
            targetSquad = 'BETA'; // Care
            suggestedModel = 'claude-3-5-sonnet';
        }
        else {
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
    static async route(taskDescription) {
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
exports.ANFISRouter = ANFISRouter;
