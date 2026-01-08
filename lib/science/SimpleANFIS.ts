/**
 * SimpleANFIS.ts
 *
 * A lightweight "Simulation" of an Adaptive Neuro-Fuzzy Inference System.
 * This is NOT a full neural network with backpropagation.
 * It uses Fuzzy Logic rules to make adaptive decisions based on inputs like Latency, RepID, and Complexity.
 *
 * Purpose:
 * To drive the "Latency as Opportunity" logic in Phase 1 of the Trinity Science Division.
 */

export interface ANFISInput {
    latencyMs: number;
    userReputation: number;    // 0-100
    taskComplexity: number;    // 0-1
    userPreference: number;    // 0-1 (0 = Speed, 1 = Accuracy)
}

export interface ANFISOutput {
    shouldQueryUser: boolean;
    queryDepth: string;        // 'none', 'shallow', 'deep'
    score: number;             // 0-1 (The raw "Opportunity Score")
    reason: string;
}

export class SimpleANFIS {

    /**
     * Membership Functions
     * Fuzzify crisp inputs into linguistic variables (Low, Medium, High)
     */

    // Gaussian Membership Function
    private gaussMF(x: number, mean: number, sigma: number): number {
        return Math.exp(-0.5 * Math.pow((x - mean) / sigma, 2));
    }

    // Linear / Trapezoidal (simplified)
    private trapMF(x: number, a: number, b: number, c: number, d: number): number {
        return Math.max(0, Math.min((x - a) / (b - a), 1, (d - x) / (d - c)));
    }

    /**
     * INFERENCE ENGINE
     * Evaluates Fuzzy Rules
     */
    public decide(input: ANFISInput): ANFISOutput {
        const { latencyMs, userReputation, taskComplexity, userPreference } = input;

        // 1. FUZZIFICATION
        // Latency
        const latencyLow = this.trapMF(latencyMs, 0, 0, 200, 500);
        const latencyHigh = this.trapMF(latencyMs, 200, 500, 10000, 10000);

        // Reputation
        const repLow = this.trapMF(userReputation, 0, 0, 20, 50);
        const repHigh = this.trapMF(userReputation, 50, 80, 100, 100);

        // Preference (Soft/Hard constraints)
        // If preference > 0.8, we strongly bias towards Accuracy (Querying)

        // 2. RULE EVALUATION (The "Knowledge Base")
        // Rule 1: High Latency + Low Reputation -> OPPORTUNITY (Educate/Include)
        const rule1Strength = Math.min(latencyHigh, repLow);

        // Rule 2: Low Latency OR High Reputation -> SPEED (Skip Query)
        const rule2Strength = Math.max(latencyLow, repHigh);

        // Rule 3: High Complexity + High Prediction for Accuracy -> DEEP QUERY
        const rule3Strength = Math.min(taskComplexity, userPreference);

        // 3. AGGREGATION & DEFUZZIFICATON (Centroid - Simulated)
        // We weight the "Yes Query" rules vs "No Query" rules

        // Score > 0.5 means "Query User"
        // We start with a base bias from UserPreference
        let weightedScore = 0.0;
        let totalWeight = 0.0;

        // Apply Rule 1 (Vote for QUERY)
        weightedScore += rule1Strength * 0.9; // Strong Yes
        totalWeight += rule1Strength;

        // Apply Rule 2 (Vote for SPEED/NO QUERY)
        weightedScore += rule2Strength * 0.1; // Strong No
        totalWeight += rule2Strength;

        // Apply Rule 3 (Vote for DEEP QUERY)
        weightedScore += rule3Strength * 1.0; // Very Strong Yes
        totalWeight += rule3Strength;

        // Avoid divide by zero
        const finalScore = totalWeight > 0 ? weightedScore / totalWeight : 0.5;

        // 4. FINAL DECISION
        let queryDepth = 'none';
        let shouldQueryUser = false;
        let reason = "Balanced approach.";

        if (finalScore > 0.75) {
            shouldQueryUser = true;
            queryDepth = 'deep';
            reason = "High Latency or User Preference detected. Maximizing Accuracy opportunity.";
        } else if (finalScore > 0.4) {
            shouldQueryUser = true;
            queryDepth = 'shallow';
            reason = "Moderate conditions. Quick check-in.";
        } else {
            shouldQueryUser = false;
            queryDepth = 'none';
            reason = "Optimizing for Speed. Latency is low or Reputation is high.";
        }

        return {
            shouldQueryUser,
            queryDepth,
            score: finalScore,
            reason
        };
    }
}
