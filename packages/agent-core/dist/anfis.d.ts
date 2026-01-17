/**
 * ANFIS (Adaptive Neuro-Fuzzy Inference System) - Light TypeScript Implementation
 *
 * Goals:
 * 1. Score inputs (Errors, Tasks) based on Fuzzy Rules (Severity, Frequency).
 * 2. Adapt weights over time (Neuro-like learning - simplified).
 */
export interface AnfisInput {
    severity: number;
    frequency: number;
    complexity: number;
}
export interface AnfisResult {
    priorityScore: number;
    action: 'IGNORE' | 'MONITOR' | 'HEAL' | 'ESCALATE';
    explanation: string;
}
export declare function computeAnfisScore(input: AnfisInput): AnfisResult;
