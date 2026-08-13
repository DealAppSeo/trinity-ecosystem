// lib/trustshell/harness/reputation.ts — earned reputation with confidence.
//
// WHY THIS EXISTS. The first E2E simulation run (seed 20260813, 2000 tasks)
// scored Kendall tau 0.429 between learned rank and ground truth — barely
// better than arbitrary. The cause was not the update rule but what was
// missing around it: a raw EWMA says nothing about how much evidence backs it,
// so an expert at 8108 on 118 observations outranked one at 6753 on 757. The
// harness was treating a lucky streak and a long track record as the same
// claim.
//
// That is the same defect this codebase keeps finding, wearing different
// clothes: a number reported with more confidence than it was earned. A
// reputation layer that does it is worse than none, because everything
// downstream — routing, quorum weight, tier, payout — inherits the overclaim.
//
// THE FIX: separate the observation from the confidence in it, and expose
// three numbers instead of one.
//
//   observedScore — what the outcomes say, unadjusted.
//   confidence    — how much evidence stands behind that, 0..1.
//   earnedScore   — observedScore shrunk toward the prior by confidence.
//
// Shrinkage is standard empirical Bayes: weight = n / (n + k), where k is the
// observation count at which the observation and the prior carry equal weight.
// New experts sit near the prior and move as they earn it, which is exactly
// the behaviour a trust layer should have, and it is the same principle as the
// cold-start rule in router.ts — no evidence is not evidence of badness.

import { BPS_MAX, type Bps } from '@/lib/trustshell/harness/types';

export interface ReputationConfig {
  /** Starting belief for an unobserved expert. Default 5000 = neutral. */
  prior?: Bps;
  /** EWMA responsiveness for the observed score, 0..1. */
  alpha?: number;
  /**
   * Observations at which evidence and prior carry equal weight.
   * Higher is more conservative — slower to trust, slower to condemn.
   */
  confidenceK?: number;
  /**
   * Confidence below which an expert is still treated as cold-start.
   *
   * CONFIDENCE, NOT AN OBSERVATION COUNT. A raw count creates a cold-start
   * cliff: the expert graduates out of exploration at observation N, but its
   * score is still shrunk hard toward the prior, so it cannot out-rank an
   * established expert and never earns observation N+1. Measured directly —
   * with a count threshold of 15, four of seven simulated experts sat at
   * exactly 15 observations forever, including the best expert in the pool
   * (true quality 0.95), which had taken 841 calls in the previous run.
   *
   * Tying the gate to confidence closes the cliff, because confidence is the
   * same quantity the shrinkage uses. An expert stops being explored precisely
   * when its own score can stand on its evidence.
   */
  coldStartConfidence?: number;
}

const DEFAULTS: Required<ReputationConfig> = {
  prior: 5000,
  alpha: 0.06,
  confidenceK: 50,
  coldStartConfidence: 0.5,
};

export interface ReputationView {
  id: string;
  /** Raw EWMA of outcomes. What the evidence says, unadjusted. */
  observedScore: Bps;
  /** Evidence weight, 0..1. n / (n + k). */
  confidence: number;
  /** observedScore shrunk toward the prior by confidence. Use this to rank. */
  earnedScore: Bps;
  observations: number;
  coldStart: boolean;
  /** Plain-language statement of what this score does and does not assert. */
  basis: string;
}

/**
 * Earned-reputation ledger.
 *
 * Deliberately holds only outcomes. No self-reported field can be written
 * here — a caller wanting to carry a claimed score keeps it beside this, and
 * the router will ignore it.
 */
export class ReputationLedger {
  private readonly observed = new Map<string, number>();
  private readonly counts = new Map<string, number>();
  private readonly cfg: Required<ReputationConfig>;

  constructor(config: ReputationConfig = {}) {
    this.cfg = { ...DEFAULTS, ...config };
    if (this.cfg.alpha <= 0 || this.cfg.alpha > 1) throw new Error('alpha must be in (0, 1]');
    if (this.cfg.confidenceK <= 0) throw new Error('confidenceK must be > 0');
  }

  /** Record one outcome. `good` is ground truth from a receipt, not a guess. */
  record(id: string, good: boolean): void {
    const prev = this.observed.get(id) ?? this.cfg.prior;
    const target = good ? BPS_MAX : 0;
    this.observed.set(id, prev + this.cfg.alpha * (target - prev));
    this.counts.set(id, (this.counts.get(id) ?? 0) + 1);
  }

  /**
   * Record a graded outcome in 0..1.
   *
   * Used where the signal is a rubric score rather than pass/fail. Values
   * outside the range throw rather than clamping: a caller producing 1.5 has a
   * bug, and silently accepting it would launder that into the ledger.
   */
  recordGraded(id: string, quality: number): void {
    if (!Number.isFinite(quality) || quality < 0 || quality > 1) {
      throw new Error(`quality must be a finite number in [0, 1]; got ${quality}`);
    }
    const prev = this.observed.get(id) ?? this.cfg.prior;
    const target = quality * BPS_MAX;
    this.observed.set(id, prev + this.cfg.alpha * (target - prev));
    this.counts.set(id, (this.counts.get(id) ?? 0) + 1);
  }

  observations(id: string): number {
    return this.counts.get(id) ?? 0;
  }

  confidence(id: string): number {
    const n = this.observations(id);
    return n / (n + this.cfg.confidenceK);
  }

  /** The number to rank on. Shrunk toward the prior by evidence weight. */
  earnedScore(id: string): Bps {
    const observed = this.observed.get(id) ?? this.cfg.prior;
    const c = this.confidence(id);
    return Math.round(c * observed + (1 - c) * this.cfg.prior);
  }

  isColdStart(id: string): boolean {
    return this.confidence(id) < this.cfg.coldStartConfidence;
  }

  /**
   * Optimistic ranking value: earned score plus a bonus for what we do not know.
   *
   * Standard upper-confidence-bound reasoning. An expert we have barely
   * observed might be excellent, and the cost of finding out is one call. The
   * bonus decays as confidence rises, so it disappears once the evidence can
   * speak for itself.
   */
  upperConfidenceBound(id: string, optimismBps = 2500): Bps {
    const earned = this.earnedScore(id);
    const bonus = (1 - this.confidence(id)) * optimismBps;
    return Math.min(BPS_MAX, Math.round(earned + bonus));
  }

  view(id: string): ReputationView {
    const n = this.observations(id);
    const c = this.confidence(id);
    const observed = Math.round(this.observed.get(id) ?? this.cfg.prior);
    const earned = this.earnedScore(id);

    let basis: string;
    if (n === 0) {
      basis = `No observations. Score is the ${this.cfg.prior} prior and asserts nothing about this expert.`;
    } else if (c < 0.5) {
      basis =
        `${n} observation(s), confidence ${c.toFixed(2)}. Observed ${observed} is shrunk toward the ` +
        `${this.cfg.prior} prior, giving ${earned}. Treat as provisional — this is not yet a track record.`;
    } else {
      basis = `${n} observations, confidence ${c.toFixed(2)}. Observed ${observed}, earned ${earned}.`;
    }

    return {
      id,
      observedScore: observed,
      confidence: c,
      earnedScore: earned,
      observations: n,
      coldStart: this.isColdStart(id),
      basis,
    };
  }

  ids(): string[] {
    return [...this.counts.keys()];
  }
}
