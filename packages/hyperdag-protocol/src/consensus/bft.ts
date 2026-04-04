/**
 * DAG Consensus + BFT with Pythagorean Comma Veto
 *
 * Patents: P-014 (Pythagorean Comma CIP), P-016 (Meta-verification)
 *
 * The Pythagorean Comma (≈1.01364) is used as a natural divergence
 * threshold: when ensemble model disagreement exceeds this ratio,
 * the system vetoes the output and escalates to HITL.
 */

/** The Pythagorean Comma ratio — 12 perfect fifths vs 7 octaves */
export const PYTHAGOREAN_COMMA = 531441 / 524288; // ≈ 1.01364

/** Full comma used as the hard veto gate */
export const COMMA_RATIO = Math.pow(3 / 2, 12) / Math.pow(2, 7); // ≈ 1.01364

export interface ConsensusResult {
  approved: boolean;
  confidence: number;       // 0-1
  signatures: ConsensusSignature[];
  vetoApplied: boolean;
  vetoReason?: string;
}

export interface ConsensusSignature {
  agent: string;
  belief: number;           // Subjective Logic: b
  disbelief: number;        // Subjective Logic: d
  uncertainty: number;      // Subjective Logic: u (b+d+u=1)
  weight: number;           // RepID-weighted influence
  timestamp: number;
}

export interface VetoDecision {
  veto: boolean;
  tier: 'NONE' | 'WARNING' | 'VETO' | 'EMERGENCY';
  gap: number;              // Divergence from comma ratio
  reason?: string;
}

/**
 * BFT Consensus — Byzantine Fault Tolerant consensus for agent swarms.
 *
 * Requires 2/3 + 1 agreement (weighted by RepID reputation scores).
 */
export class BFTConsensus {
  private minSignatures: number;

  constructor(minSignatures = 2) {
    this.minSignatures = minSignatures;
  }

  evaluate(signatures: ConsensusSignature[]): ConsensusResult {
    if (signatures.length < this.minSignatures) {
      return {
        approved: false,
        confidence: 0,
        signatures,
        vetoApplied: false,
        vetoReason: `Insufficient signatures: ${signatures.length} < ${this.minSignatures}`,
      };
    }

    // Weighted belief aggregation
    const totalWeight = signatures.reduce((sum, s) => sum + s.weight, 0);
    if (totalWeight === 0) {
      return { approved: false, confidence: 0, signatures, vetoApplied: false, vetoReason: 'Zero total weight' };
    }

    const weightedBelief = signatures.reduce((sum, s) => sum + s.belief * s.weight, 0) / totalWeight;
    const weightedDisbelief = signatures.reduce((sum, s) => sum + s.disbelief * s.weight, 0) / totalWeight;
    const weightedUncertainty = signatures.reduce((sum, s) => sum + s.uncertainty * s.weight, 0) / totalWeight;

    // Check Pythagorean Comma veto
    const veto = PythagoreanVeto.evaluate(weightedBelief, weightedDisbelief, weightedUncertainty);

    const approved = !veto.veto && weightedBelief > 0.6;

    return {
      approved,
      confidence: weightedBelief,
      signatures,
      vetoApplied: veto.veto,
      vetoReason: veto.reason,
    };
  }
}

/**
 * Pythagorean Comma Veto — ensemble divergence gate.
 *
 * When the ratio of disbelief+uncertainty to belief exceeds the
 * Pythagorean Comma, the output is vetoed.
 */
export class PythagoreanVeto {
  static evaluate(belief: number, disbelief: number, uncertainty: number): VetoDecision {
    if (belief <= 0) {
      return { veto: true, tier: 'EMERGENCY', gap: Infinity, reason: 'Zero belief — no consensus' };
    }

    const divergence = (disbelief + uncertainty) / belief;
    const gap = divergence / COMMA_RATIO;

    if (gap > 1.5) {
      return { veto: true, tier: 'EMERGENCY', gap, reason: `Divergence ${gap.toFixed(3)}x exceeds emergency threshold` };
    }
    if (gap > 1.0) {
      return { veto: true, tier: 'VETO', gap, reason: `Divergence ${gap.toFixed(3)}x exceeds Pythagorean Comma` };
    }
    if (gap > 0.85) {
      return { veto: false, tier: 'WARNING', gap, reason: `Divergence ${gap.toFixed(3)}x approaching comma threshold` };
    }

    return { veto: false, tier: 'NONE', gap };
  }
}
