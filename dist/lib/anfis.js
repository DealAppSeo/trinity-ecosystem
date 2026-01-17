"use strict";
/**
 * ANFIS (Adaptive Neuro-Fuzzy Inference System) - Light TypeScript Implementation
 *
 * Goals:
 * 1. Score inputs (Errors, Tasks) based on Fuzzy Rules (Severity, Frequency).
 * 2. Adapt weights over time (Neuro-like learning - simplified).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeAnfisScore = computeAnfisScore;
// Simplified Membership Functions
const isLow = (v) => Math.max(0, 1 - v * 2);
const isHigh = (v) => Math.max(0, (v - 0.5) * 2);
function computeAnfisScore(input) {
    // 1. FUZZIFICATION
    const sevHigh = isHigh(input.severity);
    const sevLow = isLow(input.severity);
    const freqHigh = isHigh(input.frequency);
    // 2. RULE EVALUATION (Inference Engine)
    // Rule 1: High Severity + High Frequency = CRITICAL (Escalate)
    const rule1Strength = Math.min(sevHigh, freqHigh);
    // Rule 2: High Severity + Low Frequency = URGENT (Heal)
    const rule2Strength = Math.min(sevHigh, 1 - freqHigh);
    // Rule 3: Low Severity + High Frequency = ANNOYANCE (Monitor/Heal)
    const rule3Strength = Math.min(sevLow, freqHigh);
    // Rule 4: Low Severity + Low Frequency = NOISE (Ignore)
    const rule4Strength = Math.min(sevLow, 1 - freqHigh);
    // 3. DEFUZZIFICATION (Weighted Average)
    const score = ((rule1Strength * 100) +
        (rule2Strength * 80) +
        (rule3Strength * 40) +
        (rule4Strength * 10)) / (rule1Strength + rule2Strength + rule3Strength + rule4Strength || 1);
    // 4. ACTION SELECTION
    let action = 'IGNORE';
    if (score > 85)
        action = 'ESCALATE';
    else if (score > 60)
        action = 'HEAL';
    else if (score > 30)
        action = 'MONITOR';
    return {
        priorityScore: score,
        action,
        explanation: `Score ${score.toFixed(1)} based on Sev=${input.severity}, Freq=${input.frequency}. Rule Strength [Crit:${rule1Strength.toFixed(2)}, Urg:${rule2Strength.toFixed(2)}]`
    };
}
