/**
 * SBFAOperator: Shared Belief Field Aggregator (v2.24)
 * 
 * Aggregates a triad of belief distributions into a single consensus vector.
 * Calculates S(pi) functional terms for logging and decision quality.
 */

export interface SBFAInput {
    beliefs: [number, number, number][];
    latencies: number[];
    costs: number[];
}

export interface SBFAResult {
    aggregatedBelief: [number, number, number];
    disagreement: number;
    loss: number;
    cost: number;
    latency: number;
    risk: number;
    sPi: number;
    status: 'COLLAPSE' | 'ABSTAIN';
    shouldRetrain: boolean; // v8.6 hook
    primaryResponse?: any;
}

export class SBFAOperator {
    // Weights for S(pi) functional
    private static readonly ALPHA = 1.0;   // Loss weight
    private static readonly BETA = 1.0;    // Disagreement weight
    private static readonly GAMMA = 0.001; // Cost weight
    private static readonly DELTA = 1.0;   // Latency weight
    private static readonly ETA = 5.0;     // Risk (Uncertainty) weight

    /**
     * Executes the SBFA v2.24 operator on triad input.
     */
    static process(input: SBFAInput): SBFAResult {
        const { beliefs, latencies, costs } = input;

        // 1. Aggregated Belief (Robust Log Opinion Pool)
        const aggregatedBelief = this.robustLogOpinionPool(beliefs);

        // 2. Contradiction Energy (Disagreement)
        const disagreement = this.calculateContradictionEnergy(beliefs);

        // 3. Functional Terms
        // Risk = Uncertainty (1 - max probability in agg distribution)
        const maxProb = Math.max(...aggregatedBelief);
        const risk = 1.0 - maxProb;

        // [PHASE 13] alpha_ell (Loss term): Continuous penalty for uncertainty and high-divergence triplets
        const alpha_ell = (disagreement * this.ALPHA) + (risk * 0.5);
        const totalCost = costs.reduce((a, b) => a + b, 0);
        const tailLatency = Math.max(...latencies);

        // 4. S(pi) Calculation (Refined Functional)
        // S(pi) = ALPHA*loss + BETA*disagreement + GAMMA*cost + DELTA*latency + ETA*risk
        const sPi = alpha_ell +
            (this.BETA * disagreement) +
            (this.GAMMA * totalCost) +
            (this.DELTA * tailLatency) +
            (this.ETA * risk);

        // 5. Decision Logic
        // [PHASE 13] Fast Path Belief Extraction: Decisive collapse above 0.7 confidence
        const status = maxProb > 0.7 ? 'COLLAPSE' : 'ABSTAIN';

        // [ANTIFRAGILE] RETRAIN TRIGGER (v8.6)
        // Highly controversial or highly uncertain results trigger adaptive retraining
        const shouldRetrain = disagreement > 1.0 || (risk > 0.5 && status === 'ABSTAIN');

        return {
            aggregatedBelief,
            disagreement,
            loss: alpha_ell,
            cost: totalCost,
            latency: tailLatency,
            risk,
            sPi,
            status,
            shouldRetrain
        };
    }

    /**
     * Log Opinion Pool: agg = exp(sum(log(p))) / sum(exp(sum(log(p))))
     */
    private static robustLogOpinionPool(distributions: [number, number, number][]): [number, number, number] {
        const weights = distributions.map(() => 1.0 / distributions.length);
        const epsilon = 1e-12;

        const weightedLogSum = [0, 0, 0];
        for (let i = 0; i < distributions.length; i++) {
            for (let j = 0; j < 3; j++) {
                weightedLogSum[j] += weights[i] * Math.log(distributions[i][j] + epsilon);
            }
        }

        const aggProb = weightedLogSum.map(val => Math.exp(val));
        const sumAgg = aggProb.reduce((a, b) => a + b, 0);

        return aggProb.map(val => val / sumAgg) as [number, number, number];
    }

    /**
     * Mean KL Divergence from the average distribution.
     */
    private static calculateContradictionEnergy(distributions: [number, number, number][]): number {
        const epsilon = 1e-12;

        // Mean Distribution
        const meanDist = [0, 0, 0];
        for (const d of distributions) {
            for (let j = 0; j < 3; j++) meanDist[j] += d[j];
        }
        for (let j = 0; j < 3; j++) meanDist[j] /= distributions.length;

        // KL Divergence Helper
        const kl = (p: number[], q: number[]) => {
            let sum = 0;
            for (let i = 0; i < 3; i++) {
                const pi = Math.max(p[i], epsilon);
                const qi = Math.max(q[i], epsilon);
                sum += pi * Math.log(pi / qi);
            }
            return sum;
        };

        const klDivs = distributions.map(d => kl(d, meanDist));
        return klDivs.reduce((a, b) => a + b, 0) / klDivs.length;
    }
}
