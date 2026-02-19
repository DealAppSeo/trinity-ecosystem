/**
 * Swarm Intelligence Algorithms (PSO, ACO, ABC)
 * Based on Evolutionary Swarm Pruning and Swarm Intelligence Algorithms.md
 */

export interface Particle {
    position: number[];
    velocity: number[];
    bestPosition: number[];
    bestFitness: number;
}

/**
 * Particle Swarm Optimization (PSO)
 * Best for fast convergence and global optimization.
 */
export class PSO {
    private particles: Particle[] = [];
    private globalBestPosition: number[] = [];
    private globalBestFitness = -Infinity;

    constructor(
        private numParticles: number,
        private dim: number,
        private fitnessFn: (pos: number[]) => number,
        private w = 0.729,  // Inertia
        private c1 = 1.494, // Cognitive coefficient
        private c2 = 1.494  // Social coefficient
    ) {
        this.initialize();
    }

    private initialize() {
        for (let i = 0; i < this.numParticles; i++) {
            const pos = Array.from({ length: this.dim }, () => Math.random());
            const vel = Array.from({ length: this.dim }, () => (Math.random() - 0.5) * 0.1);
            const fitness = this.fitnessFn(pos);

            this.particles.push({
                position: pos,
                velocity: vel,
                bestPosition: [...pos],
                bestFitness: fitness
            });

            if (fitness > this.globalBestFitness) {
                this.globalBestFitness = fitness;
                this.globalBestPosition = [...pos];
            }
        }
    }

    step() {
        for (const p of this.particles) {
            for (let d = 0; d < this.dim; d++) {
                const r1 = Math.random();
                const r2 = Math.random();

                // v_i = w * v_i + c1 * r1 * (pbest_i - x_i) + c2 * r2 * (gbest - x_i)
                p.velocity[d] = this.w * p.velocity[d] +
                    this.c1 * r1 * (p.bestPosition[d] - p.position[d]) +
                    this.c2 * r2 * (this.globalBestPosition[d] - p.position[d]);

                p.position[d] += p.velocity[d];

                // Clamp to [0, 1]
                p.position[d] = Math.max(0, Math.min(1, p.position[d]));
            }

            const fitness = this.fitnessFn(p.position);
            if (fitness > p.bestFitness) {
                p.bestFitness = fitness;
                p.bestPosition = [...p.position];
            }

            if (fitness > this.globalBestFitness) {
                this.globalBestFitness = fitness;
                this.globalBestPosition = [...p.position];
            }
        }
    }

    getBest() {
        return { position: this.globalBestPosition, fitness: this.globalBestFitness };
    }
}

/**
 * Ant Colony Optimization (ACO)
 * Best for routing and discrete pathfinding.
 */
export class ACO {
    private pheromones: number[][];

    constructor(
        private nodes: number,
        private alpha = 1.0, // Pheromone importance
        private beta = 2.0,  // Heuristic importance
        private rho = 0.1,   // Evaporation rate
        private q = 100      // Pheromone deposit amount
    ) {
        this.pheromones = Array.from({ length: nodes }, () => Array(nodes).fill(0.1));
    }

    calculateProbabilities(current: number, allowed: number[], distances: number[][]): number[] {
        const total = allowed.reduce((sum, next) => {
            const tau = Math.pow(this.pheromones[current][next], this.alpha);
            const eta = Math.pow(1 / (distances[current][next] || 0.001), this.beta);
            return sum + (tau * eta);
        }, 0);

        return allowed.map(next => {
            const tau = Math.pow(this.pheromones[current][next], this.alpha);
            const eta = Math.pow(1 / (distances[current][next] || 0.001), this.beta);
            return (tau * eta) / (total || 1);
        });
    }

    updatePheromones(paths: { path: number[], distance: number }[]) {
        // Evaporation
        for (let i = 0; i < this.nodes; i++) {
            for (let j = 0; j < this.nodes; j++) {
                this.pheromones[i][j] *= (1 - this.rho);
            }
        }

        // Deposit
        for (const { path, distance } of paths) {
            const deposit = this.q / (distance || 1);
            for (let k = 0; k < path.length - 1; k++) {
                const i = path[k];
                const j = path[k + 1];
                this.pheromones[i][j] += deposit;
            }
        }
    }
}

/**
 * Artificial Bee Colony (ABC)
 * Best for hyperparameter tuning.
 */
export class ABC {
    private foodSources: number[][];
    private fitness: number[];
    private trialCount: number[];

    constructor(
        private numBees: number,
        private dim: number,
        private objectiveFn: (x: number[]) => number,
        private limit = 10 // Trial limit before abandonment
    ) {
        this.foodSources = Array.from({ length: numBees }, () => Array.from({ length: dim }, () => Math.random()));
        this.fitness = this.foodSources.map(f => this.calculateFitness(this.objectiveFn(f)));
        this.trialCount = new Array(numBees).fill(0);
    }

    private calculateFitness(f: number): number {
        return f >= 0 ? 1 / (1 + f) : 1 + Math.abs(f);
    }

    step() {
        // 1. Employed Bees Phase
        for (let i = 0; i < this.numBees; i++) {
            this.explore(i);
        }

        // 2. Onlooker Bees Phase
        const totalFitness = this.fitness.reduce((a, b) => a + b, 0);
        const probs = this.fitness.map(f => f / totalFitness);

        for (let i = 0; i < this.numBees; i++) {
            if (Math.random() < probs[i]) {
                this.explore(i);
            }
        }

        // 3. Scout Bees Phase
        for (let i = 0; i < this.numBees; i++) {
            if (this.trialCount[i] > this.limit) {
                this.foodSources[i] = Array.from({ length: this.dim }, () => Math.random());
                this.fitness[i] = this.calculateFitness(this.objectiveFn(this.foodSources[i]));
                this.trialCount[i] = 0;
            }
        }
    }

    private explore(i: number) {
        const d = Math.floor(Math.random() * this.dim);
        const k = Math.floor(Math.random() * this.numBees);
        if (k === i) return;

        const phi = (Math.random() - 0.5) * 2; // [-1, 1]
        const newSource = [...this.foodSources[i]];
        newSource[d] = this.foodSources[i][d] + phi * (this.foodSources[i][d] - this.foodSources[k][d]);
        newSource[d] = Math.max(0, Math.min(1, newSource[d]));

        const newFit = this.calculateFitness(this.objectiveFn(newSource));
        if (newFit > this.fitness[i]) {
            this.foodSources[i] = newSource;
            this.fitness[i] = newFit;
            this.trialCount[i] = 0;
        } else {
            this.trialCount[i]++;
        }
    }

    getBest() {
        const bestIdx = this.fitness.indexOf(Math.max(...this.fitness));
        return { source: this.foodSources[bestIdx], fitness: this.fitness[bestIdx] };
    }
}
