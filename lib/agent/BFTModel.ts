/**
 * BFTModel (3-Ply Byzantine Fault Tolerance)
 * Based on ai_trinity_symphony_security_architecture_v2.md
 */

import { AnfisInput, computeAnfisScore } from '../anfis';

export enum ConsensusPly {
    EXECUTION = 'ply1_execution',
    VERIFICATION = 'ply2_verification',
    CONSENSUS = 'ply3_consensus'
}

export interface BFTResult {
    ply: ConsensusPly;
    agentName: string;
    output: string;
    confidence: number;
    family: string;
}

export class BFTModel {
    /**
     * Aggregates outputs from multiple agents using ANFIS-weighted consensus.
     * Ply 3: Consensus (ANFIS-weighted BFT, 2/3 threshold)
     */
    static calculateConsensus(results: BFTResult[]): { consensus: string, confidence: number, agreement: number } {
        if (results.length === 0) return { consensus: '', confidence: 0, agreement: 0 };

        // 1. Group by output similarity (simplified semantic grouping)
        const groups: Map<string, BFTResult[]> = new Map();
        for (const r of results) {
            // In a real system, we'd use semantic similarity. For now, exact match or simple normalization.
            const key = r.output.trim().toLowerCase();
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(r);
        }

        // 2. Weight groups by ANFIS score of participants
        const weightedScores = Array.from(groups.entries()).map(([output, members]) => {
            const totalWeight = members.reduce((sum, m) => {
                // Compute ANFIS weight based on agent's reputation/confidence
                const anfisScore = computeAnfisScore({
                    severity: 0.6, // Slight bias to ensure non-zero rules
                    frequency: m.confidence / 100,
                    complexity: 0.5
                });
                const weight = anfisScore.priorityScore || (m.confidence / 2); // Fallback to confidence-based
                return sum + weight;
            }, 0);

            return { output: members[0].output, weight: totalWeight, count: members.length };
        });

        // 3. Find winner (highest weighted score)
        weightedScores.sort((a, b) => b.weight - a.weight);
        const winner = weightedScores[0];

        // 4. Calculate agreement ratio (2/3 threshold check)
        const agreement = winner.count / results.length;
        const confidence = (winner.weight / (results.length * 100)) * 100;
        const isConsensusMet = agreement >= 0.66; // Hardcoded Layer 3 gate

        return {
            consensus: winner.output,
            confidence: Math.min(100, confidence),
            agreement,
            isConsensusMet
        };
    }

    /**
     * Risk-Based Ply Selection
     */
    static getRequiredPlys(riskScore: number): { executors: number, verifiers: number } {
        if (riskScore < 0.1) return { executors: 1, verifiers: 0 };  // Trivial
        if (riskScore < 0.3) return { executors: 2, verifiers: 1 };  // Low
        if (riskScore < 0.6) return { executors: 3, verifiers: 2 };  // Medium
        if (riskScore < 0.85) return { executors: 3, verifiers: 3 }; // High
        return { executors: 3, verifiers: 3 };                       // Critical (Human HITL handled elsewhere)
    }
}
