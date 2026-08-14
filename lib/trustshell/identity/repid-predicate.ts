// lib/trustshell/identity/repid-predicate.ts
//
// Turns a measured RepID score into a PredicateStatement a ControlProof can
// carry: "this agent's reputation clears <threshold>", with the score itself as
// the private witness.
//
// THE POINT OF THIS FILE IS THE PUBLIC INPUTS, NOT THE PREDICATE.
//
// `repid >= 3000` reads identically whether it rests on 500 observations or on
// two. EarnedMetrics already knows the difference — it distinguishes measured /
// insufficient / unmeasured per signal, penalises thin records, and shrinks
// toward zero rather than toward a fleet average. A predicate that published
// only the boolean would throw all of that away at the last step, and the
// verifier would have no way to tell a well-evidenced pass from a lucky one.
//
// So the evidence quality travels in `publicInputs`, where a verifier can see
// it and write policy against it. The score stays in `privateWitness`. That
// split is the whole design: WHAT was concluded is public, the value it was
// concluded from is not.
//
// WHY A NON-POSITIVE THRESHOLD IS REFUSED. An agent with no evidence scores
// exactly 0 — that is `PRIOR_VALUE`, and it is deliberate: no credit for having
// no record. With `threshold: 0`, `0 >= 0` is true, so the agent with the least
// evidence in the system passes. A threshold of zero is not a lax policy, it is
// an inverted one, and it is refused at construction rather than left as a
// footgun.

import type { EvidenceReport } from '../EarnedMetrics';
import type { PredicateStatement } from './proof-provider';

export interface RepidPredicateInput {
  /** The measured score. Becomes the private witness. */
  score: number;
  /** Must be > 0. See the note above. */
  threshold: number;
  /** From `describeEvidence()`. Its summary becomes public. */
  evidence: EvidenceReport;
  /** Optional: names the agent in the public inputs, binding the claim to it. */
  agentName?: string;
}

/**
 * Build the statement. Deterministic and pure — the proof provider adds the
 * salt and the commitment.
 */
export function repidPredicate(input: RepidPredicateInput): PredicateStatement {
  const { score, threshold, evidence } = input;

  if (!Number.isFinite(threshold) || threshold <= 0) {
    throw new Error(
      `threshold must be > 0, got ${threshold}. An agent with no evidence scores ` +
        `0, so a non-positive threshold is cleared by the least-evidenced agent ` +
        `in the system.`
    );
  }
  if (!Number.isFinite(score) || score < 0) {
    throw new Error(`score must be a non-negative finite number, got ${score}`);
  }

  const publicInputs: Record<string, string | number | boolean> = {
    bound: threshold,
    // Evidence quality, published so the verifier can weigh the claim.
    fullyMeasured: evidence.fullyMeasured,
    measuredSignals: evidence.measured.length,
    insufficientSignals: evidence.insufficient.length,
    unmeasuredSignals: evidence.unmeasured.length,
    // Lowest confidence across measured signals. A pass at 0.02 is a different
    // object from a pass at 0.9, and collapsing them is how a thin record
    // starts looking like a strong one.
    weakestConfidence: round4(evidence.weakestConfidence),
  };
  if (input.agentName) publicInputs.agent = input.agentName;

  return {
    predicate: 'gte',
    publicInputs,
    privateWitness: { value: score },
  };
}

/**
 * Would a verifier with this policy accept the claim?
 *
 * Separate from the predicate on purpose. The predicate says whether the score
 * cleared the bound; this says whether the EVIDENCE is good enough to act on.
 * Two different questions, and merging them would let a policy change silently
 * alter what the commitment binds.
 */
export interface EvidencePolicy {
  /** Reject unless every signal is measured. */
  requireFullyMeasured?: boolean;
  /** Reject when the weakest measured signal is below this. */
  minWeakestConfidence?: number;
  /** Reject unless at least this many signals are measured. */
  minMeasuredSignals?: number;
}

export function evidenceMeetsPolicy(
  statement: PredicateStatement,
  policy: EvidencePolicy
): { ok: boolean; reasons: string[] } {
  const p = statement.publicInputs;
  const reasons: string[] = [];

  if (policy.requireFullyMeasured && p.fullyMeasured !== true) {
    reasons.push(
      `not fully measured (${String(p.unmeasuredSignals)} unmeasured, ` +
        `${String(p.insufficientSignals)} insufficient)`
    );
  }
  if (
    policy.minWeakestConfidence !== undefined &&
    Number(p.weakestConfidence) < policy.minWeakestConfidence
  ) {
    reasons.push(
      `weakest confidence ${String(p.weakestConfidence)} < ${policy.minWeakestConfidence}`
    );
  }
  if (
    policy.minMeasuredSignals !== undefined &&
    Number(p.measuredSignals) < policy.minMeasuredSignals
  ) {
    reasons.push(`${String(p.measuredSignals)} measured signals < ${policy.minMeasuredSignals}`);
  }

  return { ok: reasons.length === 0, reasons };
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
