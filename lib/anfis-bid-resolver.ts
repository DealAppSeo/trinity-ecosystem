// ============================================
// ANFIS BID RESOLVER (TypeScript Implementation)
// ============================================
// Implements Adaptive Neuro-Fuzzy Inference System for Bid Scoring.
// Replaces Python's skfuzzy with native TS math.

interface Bid {
    cost: number;        // 0-1 (Normalized)
    efficiency: number;  // 0-1 (Normalized)
    redundancy: number;  // 0-1 (Normalized)
    flexibility: number; // 0-1 (Normalized)
    proposal: string;
}

// 1. FUZZY MEMBERSHIP FUNCTIONS
// Triangular Membership Function: trimf(x, [a, b, c])
function trimf(x: number, [a, b, c]: [number, number, number]): number {
    return Math.max(0, Math.min((x - a) / (b - a), (c - x) / (c - b)));
}

// 2. FUZZY RULES (Takagi-Sugeno / Mamdani Hybrid)
// Returns a crisp score (0-1)
export function anfisBidScore(bid: Bid, pastWinRate: number = 0.5): number {

    // Step A: Fuzzify Inputs
    // Low / Med / High ranges
    const lowRange: [number, number, number] = [0, 0, 0.5];
    const highRange: [number, number, number] = [0.5, 1, 1];

    // Membership Degrees
    const costLow = trimf(bid.cost, lowRange);
    const effHigh = trimf(bid.efficiency, highRange);
    const redHigh = trimf(bid.redundancy, highRange);
    const flexHigh = trimf(bid.flexibility, highRange);

    // Step B: Rule Evaluation (Inference)
    // Rule 1: IF Cost is Low AND Efficiency is High THEN Score is High
    const rule1Strength = Math.min(costLow, effHigh); // t-norm (min)

    // Rule 2: IF Redundancy is High AND Flexibility is High THEN Score is High (Resilience)
    const rule2Strength = Math.min(redHigh, flexHigh);

    // Aggregation (OR)
    const totalStrength = Math.max(rule1Strength, rule2Strength);

    // Step C: Defuzzification (Centroid Approximation)
    // For simplicity in TS, we map strength directly to score output, 
    // scaled by the "High" centroid (approx 0.75 in [0.5, 1, 1])
    let fuzzyScore = totalStrength * 0.9;

    // Step D: Neural Adaptation (Simulated MLP)
    // "Learns" from past win rate to boost/dampen score.
    // boosting factor = 1 + (winRate - 0.5) * 0.2
    // If agent wins often (0.8), boost = 1 + 0.06 = 1.06
    const neuralBoost = 1 + (pastWinRate - 0.5) * 0.2;

    return Math.min(0.99, fuzzyScore * neuralBoost);
}

// 3. RESOLVER
// Selects the winner from a list of bids
export function resolveBidsANFIS(bids: { agent: string, bid: Bid, pastWinRate: number }[]) {
    const scoredBids = bids.map(b => ({
        ...b,
        score: anfisBidScore(b.bid, b.pastWinRate)
    }));

    // Find Max
    let maxScore = -1;
    let winner = scoredBids[0];

    for (const b of scoredBids) {
        if (b.score > maxScore) {
            maxScore = b.score;
            winner = b;
        }
    }

    return winner;
}
