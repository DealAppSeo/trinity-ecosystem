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

import { BPS_MAX, type Bps } from './types';

export interface ReputationConfig {
  /** Starting belief for an unobserved expert. Default 5000 = neutral. */
  prior?: Bps;
  /** EWMA responsiveness for the observed score, 0..1. */
  alpha?: number;
  /**
   * Observations at which evidence and prior carry equal weight.
   * Higher is more conservative — slower to trust, slower to condemn.
   *
   * DEFAULT 20, LOWERED FROM 50 ON 2026-08-13. Chosen by measurement rather
   * than taste: `npm run experiment` swept it on train seeds, re-measured the
   * winners on held-out seeds, and then re-ran them in a world with the
   * deliberately-planted excellent expert removed. 20 was the only change that
   * survived all three, and it moves three metrics the same way at once —
   * correctness +1.86pp, Kendall tau 0.693 → 0.800, p99 811 → 202 ms.
   *
   * The mechanism is not "explore more". In the counterfactual world it gives
   * the unknown expert FEWER calls than 50 did (21 vs 46); it reacts to
   * evidence faster, which includes demoting a mediocre unknown sooner. Raising
   * `explorationRate` looked like a comparable win across ten seeds and was an
   * artefact of the planted gem — it is NOT in the defaults for that reason.
   *
   * THERE IS A FLOOR BELOW THIS AND IT IS NOT FAR. K is what weights evidence
   * against the prior, so K → 0 approaches a raw EWMA, which is the original
   * defect: 118 observations outranking 757. The sweep shows the turn already
   * beginning — K=10 buys more correctness than K=20 (+2.33 vs +1.86pp) while
   * ranking WORSE (tau 0.714 vs 0.800). Optimising the headline metric alone
   * picks the wrong value. Do not lower this further without re-running the
   * sweep and reading the tau column.
   *
   * NOT CHECKED: all of the above is simulator evidence. No live-LLM or
   * `agent_repid` replay validates it, and the sweep says least about fleets
   * where each expert sees far fewer than ~250 observations — precisely the
   * regime where a low K is most dangerous.
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
  confidenceK: 20,
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

  /**
   * Complete state for one expert, sufficient to reconstruct it exactly.
   *
   * BOTH FIELDS ARE LOAD-BEARING. `observedScore` alone is not a ledger: the
   * whole design rests on `confidence = n / (n + k)`, so an expert restored
   * without its observation count has confidence 0, and `earnedScore` collapses
   * to the prior no matter what it had earned. Persisting the score and
   * dropping the count would silently erase every track record in the fleet
   * while looking like a successful save.
   */
  snapshot(): ReputationRecord[] {
    return this.ids().map((id) => ({
      id,
      // The raw EWMA, unrounded. `view()` rounds for display; rounding here
      // would make save/load lossy in a way that compounds over restarts.
      observedScore: this.observed.get(id) ?? this.cfg.prior,
      observations: this.counts.get(id) ?? 0,
    }));
  }

  /**
   * Replace all state with `records`. Existing entries are discarded.
   *
   * Replace rather than merge, because merging two ledgers is not defined —
   * you cannot add observation counts from two sources without knowing whether
   * they observed the same events.
   */
  hydrate(records: readonly ReputationRecord[]): void {
    this.observed.clear();
    this.counts.clear();
    for (const r of records) {
      if (!Number.isFinite(r.observedScore)) {
        throw new Error(`observedScore for '${r.id}' must be finite; got ${r.observedScore}`);
      }
      if (!Number.isInteger(r.observations) || r.observations < 0) {
        throw new Error(
          `observations for '${r.id}' must be a non-negative integer; got ${r.observations}`
        );
      }
      this.observed.set(r.id, r.observedScore);
      this.counts.set(r.id, r.observations);
    }
  }
}

/** One expert's persisted state. See `ReputationLedger.snapshot()`. */
export interface ReputationRecord {
  id: string;
  /** Raw EWMA of outcomes, 0..10000. Unrounded. */
  observedScore: number;
  /** Number of outcomes behind it. Without this, confidence cannot be rebuilt. */
  observations: number;
}

/**
 * Somewhere a ledger can be persisted.
 *
 * Declared here so the harness stays portable — this file may not import a
 * database client, so the interface lives inside and every implementation
 * lives outside. `lib/trustshell/persistence/supabase-reputation-store.ts` is
 * the Postgres one.
 *
 * `load()` returning an empty array means "no state stored", which is a valid
 * cold start. An implementation that cannot tell empty from broken must throw
 * rather than return `[]` — a silent empty load looks exactly like a fresh
 * fleet and would wipe every earned score on the next save.
 */
export interface ReputationStore {
  load(): Promise<ReputationRecord[]>;
  save(records: readonly ReputationRecord[]): Promise<void>;
}
