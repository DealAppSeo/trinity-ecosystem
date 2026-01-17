"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChHHOOptimizer = void 0;
/**
 * Chaotic Harris Hawks Optimizer (ChHHO)
 *
 * Implements the HHO metaheuristic with Chaotic Maps (attributes 1-4) for
 * enhanced global exploration and faster convergence O(log n).
 *
 * Reference: "Multiplicative GNN with O(log n) Convergence" (Patent Filing Aug 17, 2025)
 */
class ChHHOOptimizer {
    // Chaotic Map: Logistic Map (x_n+1 = 4 * x_n * (1 - x_n))
    // Used to perturb the chaotic sequences for exploration
    chaoticMap(x) {
        return 4.0 * x * (1.0 - x);
    }
    constructor(popSize, dim, fitnessFunc) {
        this.popSize = popSize;
        this.dim = dim;
        this.fitnessFunc = fitnessFunc;
        // Initialize Population randomly [0, 1]
        this.population = Array(popSize).fill(0).map(() => Array(dim).fill(0).map(() => Math.random()));
    }
    /**
     * Run Optimization Loop
     * @param maxIter Number of iterations (e.g., 100)
     */
    optimize(maxIter) {
        let rabbitPos = this.population[0]; // Best hawk (Rabbit)
        let rabbitFit = Infinity;
        // Find initial best
        this.population.forEach(hawk => {
            const fit = this.fitnessFunc(hawk);
            if (fit < rabbitFit) {
                rabbitFit = fit;
                rabbitPos = [...hawk];
            }
        });
        // Loop
        for (let t = 0; t < maxIter; t++) {
            const E0 = -1 + 2 * Math.random(); // Initial energy [-1, 1]
            const E = 2 * E0 * (1 - (t / maxIter)); // Escaping energy
            // Update Hawks
            for (let i = 0; i < this.popSize; i++) {
                const hawk = this.population[i];
                // EXPLORATION (Wait/Perch)
                if (Math.abs(E) >= 1) {
                    const q = Math.random();
                    if (q >= 0.5) {
                        // Perch based on random tall tree
                        const randomHawk = this.population[Math.floor(Math.random() * this.popSize)];
                        this.population[i] = hawk.map((val, idx) => randomHawk[idx] - Math.random() * Math.abs(randomHawk[idx] - 2 * Math.random() * val));
                    }
                    else {
                        // Chaotic Perch (Logistic Map perturbation)
                        // x_new = x_old + chaotic_scalar * (lb + r * (ub - lb)) - simplified for [0,1]
                        this.population[i] = hawk.map(val => this.chaoticMap(val));
                    }
                }
                // EXPLOITATION (Besiege)
                else {
                    const r = Math.random();
                    const J = 2 * (1 - Math.random()); // Jump strength
                    if (r >= 0.5 && Math.abs(E) >= 0.5) {
                        // Soft Besiege
                        const delta = hawk.map((val, idx) => rabbitPos[idx] - val);
                        this.population[i] = delta.map((d, idx) => delta[idx] - E * Math.abs(J * rabbitPos[idx] - hawk[idx]));
                    }
                    else if (r >= 0.5 && Math.abs(E) < 0.5) {
                        // Hard Besiege
                        this.population[i] = hawk.map((val, idx) => rabbitPos[idx] - E * Math.abs(rabbitPos[idx] - val));
                    }
                    else {
                        // Chaotic Dive (Integration with Patent "Question-Driven Reorg")
                        // Use chaotic map to determine dive intensity
                        const chaos = this.chaoticMap(Math.random());
                        // Simplified soft besiege with chaos
                        this.population[i] = hawk.map((val, idx) => rabbitPos[idx] - E * Math.abs(rabbitPos[idx] - val) * chaos);
                    }
                }
                // Boundary Check [0, 1] & Fitness Check
                this.population[i] = this.population[i].map(v => Math.max(0, Math.min(1, v)));
                const newFit = this.fitnessFunc(this.population[i]);
                if (newFit < rabbitFit) {
                    rabbitFit = newFit;
                    rabbitPos = [...this.population[i]];
                }
            }
        }
        return { bestParams: rabbitPos, bestFitness: rabbitFit };
    }
}
exports.ChHHOOptimizer = ChHHOOptimizer;
