// lib/trustshell/harness/escalate.ts — when is a panel worth paying for?
//
// `aggregate.ts` measured +6.7 to +9.7 points from a panel of 3–4, at 3–4× the
// calls and p99 193 → 632/959 ms. Paying that on every task is the wrong trade
// on almost any real workload: most tasks have an obvious best expert and a
// panel returns what top-1 would have returned anyway.
//
// This is RouteMoA's answer — screen cheaply, escalate only when the prior is
// uncertain. The screening signal must itself be free, so it comes entirely
// from ledger state the router already computed. **If deciding whether to
// escalate costs a call, the policy has spent the money it exists to save.**
//
// THREE SIGNALS, each a different kind of "we do not know":
//
//   * THIN MARGIN — the leader barely beats the runner-up, so which expert is
//     "best" is close to arbitrary. A panel breaks the tie with evidence
//     instead of a rounding difference.
//   * LOW EARNED — even the leader is mediocre, so top-1 is picking the least
//     bad option. Combining several mediocre experts can beat any of them.
//   * LOW CONFIDENCE — the leader's score rests on little evidence. Its rank
//     could be luck.
//
// THE BUDGET CAP AND WHY IT REPORTS BEING HIT. `maxEscalationRate` bounds the
// share of tasks that may escalate. A cap that silently declines to escalate
// would degrade answer quality while every cost metric looked healthy — the
// exact shape this codebase keeps finding. So a refusal is not silent:
// `budgetDenied` is true whenever the policy WANTED a panel and could not
// afford one, and the caller can count those.
//
// THE CAP IS A SAFETY CEILING, NOT AN ALLOCATOR. Set `maxEscalationRate` to
// bound worst-case spend and tune the FLOORS to decide what deserves a panel.
// Using the cap to do the deciding is what fails.
//
// This was established by building the obvious fix and measuring it. The cap is
// greedy — it spends on the first qualifying tasks, which early in a run are
// cold-start tasks — so a windowed-quantile allocator was written to spend on
// the MOST uncertain tasks instead. On a workload of 20 mild then 5 severe
// tasks at a 20% cap:
//
//   floor 1000, greedy      severe caught 1/5, budget burned on 4 mild
//   floor 1000, quantile    severe caught 1/5, budget burned on 4 mild
//   floor  500, greedy      severe caught 5/5, budget burned on 0 mild
//
// **The quantile allocator produced exactly zero improvement, and a tighter
// floor fixed the problem completely at the same cap.** It was removed rather
// than shipped, because machinery that does not do what its name claims is the
// defect this codebase exists to catch.
//
// The reason is not a bug and is not patchable: an online quantile is estimated
// from tasks already seen, so it cannot reserve budget for a severity it has
// never observed. When mild tasks arrive first they define the distribution,
// clear their own threshold, and take the budget. Reserving for the unseen
// needs lookahead or a prior on the severity distribution, and neither is
// available here. A first attempt selecting on the quantile ALONE also overshot
// a 20% cap to 68%, because a tied mass of equally uncertain tasks all clear a
// threshold equal to their own value.
//
// `uncertainty` is still reported on every decision. It earned its place — it
// is the measurement that diagnosed all of the above — and it lets a caller see
// how far short a task fell rather than only whether a boolean tripped.

import type { Bps, Clock } from '@/lib/trustshell/harness/types';

export type EscalationReason = 'thin_margin' | 'low_earned' | 'low_confidence';

/**
 * Everything the policy is allowed to look at.
 *
 * All of it is ledger-derived and already computed by the router, so evaluating
 * a policy costs no calls and no tokens.
 */
export interface EscalationSignals {
  /** Earned score of the leading candidate, 0..10000. */
  topEarned: Bps;
  /** Earned score of the runner-up. Omit when there is only one candidate. */
  runnerUpEarned?: Bps;
  /** Evidence weight behind the leader's score, 0..1. */
  topConfidence: number;
}

export interface EscalationConfig {
  /** Escalate when the leader's earned score is below this. 0 disables. */
  earnedFloor?: Bps;
  /** Escalate when the leader's lead over the runner-up is below this. 0 disables. */
  marginFloor?: Bps;
  /** Escalate when confidence in the leader is below this. 0 disables. */
  confidenceFloor?: number;
  /**
   * Maximum share of decisions that may escalate, 0..1. 1 allows every
   * escalation the signals ask for; 0 disables panels entirely.
   *
   * A hard ceiling, always. It bounds spend; it does not choose what to spend
   * on. See the header for why that distinction is load-bearing.
   */
  maxEscalationRate?: number;
}

export interface EscalationDecision {
  escalate: boolean;
  /** Which signal fired. Null when no signal fired at all. */
  reason: EscalationReason | null;
  /** Escalations / decisions so far, 0..1. Includes this decision. */
  rateSoFar: number;
  /**
   * True when a signal fired but the budget cap refused the panel. Distinct
   * from `escalate: false, reason: null`, which means nothing asked for one.
   */
  budgetDenied: boolean;
  /**
   * How far short of its floor the worst-off signal fell, 0..1. 0 means no
   * signal fired. This is what quantile mode ranks tasks by, and it is exposed
   * so a caller can see WHY one task outranked another.
   */
  uncertainty: number;
  /** Why, in plain language. */
  basis: string;
  decidedAt: number;
}

export interface EscalationStats {
  decisions: number;
  escalations: number;
  denied: number;
  /** escalations / decisions, 0..1. */
  rate: number;
  byReason: Record<EscalationReason, number>;
}

const DEFAULTS: Required<EscalationConfig> = {
  earnedFloor: 0,
  marginFloor: 0,
  confidenceFloor: 0,
  maxEscalationRate: 1,
};

export class EscalationPolicy {
  private readonly cfg: Required<EscalationConfig>;
  private decisions = 0;
  private escalations = 0;
  private denied = 0;
  private readonly reasons: Record<EscalationReason, number> = {
    thin_margin: 0,
    low_earned: 0,
    low_confidence: 0,
  };


  constructor(
    private readonly clock: Clock,
    config: EscalationConfig = {}
  ) {
    this.cfg = { ...DEFAULTS, ...config };
    if (this.cfg.maxEscalationRate < 0 || this.cfg.maxEscalationRate > 1) {
      throw new Error('maxEscalationRate must be in [0, 1]');
    }
    if (this.cfg.confidenceFloor < 0 || this.cfg.confidenceFloor > 1) {
      throw new Error('confidenceFloor must be in [0, 1]');
    }
    if (this.cfg.earnedFloor < 0) throw new Error('earnedFloor must be >= 0');
    if (this.cfg.marginFloor < 0) throw new Error('marginFloor must be >= 0');
  }

  /**
   * How far short of its floor the worst-off armed signal fell, 0..1.
   *
   * Each signal is normalised by its OWN floor, so a margin floor in basis
   * points and a confidence floor in 0..1 become comparable. The maximum is
   * taken rather than the sum or mean: a task that is desperately short on one
   * axis is uncertain, and averaging that against two comfortable axes would
   * hide it. A disarmed floor (0) contributes nothing.
   */
  private uncertaintyOf(signals: EscalationSignals, margin: number): number {
    let worst = 0;
    if (this.cfg.marginFloor > 0 && Number.isFinite(margin)) {
      worst = Math.max(worst, (this.cfg.marginFloor - margin) / this.cfg.marginFloor);
    }
    if (this.cfg.earnedFloor > 0) {
      worst = Math.max(worst, (this.cfg.earnedFloor - signals.topEarned) / this.cfg.earnedFloor);
    }
    if (this.cfg.confidenceFloor > 0) {
      worst = Math.max(
        worst,
        (this.cfg.confidenceFloor - signals.topConfidence) / this.cfg.confidenceFloor
      );
    }
    return Math.max(0, Math.min(1, worst));
  }



  /**
   * Decide whether this task is worth a panel.
   *
   * Signals are checked in order of how directly they bear on "top-1 might be
   * the wrong pick": margin first, because a thin lead means the ranking itself
   * is barely holding; then absolute quality; then evidence.
   */
  decide(signals: EscalationSignals): EscalationDecision {
    const decidedAt = this.clock.now();
    this.decisions += 1;

    let reason: EscalationReason | null = null;
    let detail = '';

    const margin =
      signals.runnerUpEarned === undefined
        ? Number.POSITIVE_INFINITY
        : signals.topEarned - signals.runnerUpEarned;

    if (this.cfg.marginFloor > 0 && margin < this.cfg.marginFloor) {
      reason = 'thin_margin';
      detail = `leader is only ${Math.round(margin)} bps clear of the runner-up, under the ${this.cfg.marginFloor} floor`;
    } else if (this.cfg.earnedFloor > 0 && signals.topEarned < this.cfg.earnedFloor) {
      reason = 'low_earned';
      detail = `best available earned ${Math.round(signals.topEarned)} bps, under the ${this.cfg.earnedFloor} floor`;
    } else if (this.cfg.confidenceFloor > 0 && signals.topConfidence < this.cfg.confidenceFloor) {
      reason = 'low_confidence';
      detail = `leader's confidence is ${signals.topConfidence.toFixed(2)}, under the ${this.cfg.confidenceFloor} floor`;
    }

    const uncertainty = this.uncertaintyOf(signals, margin);

    if (reason === null) {
      return {
        escalate: false,
        reason: null,
        rateSoFar: this.escalations / this.decisions,
        budgetDenied: false,
        uncertainty,
        basis: 'No uncertainty signal fired; top-1 is a clear pick.',
        decidedAt,
      };
    }

    let denyBasis: string | null = null;

    {
      // `escalations + 1` because this decision would be the one spending it —
      // testing the pre-increment rate lets the cap be exceeded by exactly one,
      // the classic off-by-one in a rate limiter.
      const wouldBeRate = (this.escalations + 1) / this.decisions;
      if (wouldBeRate > this.cfg.maxEscalationRate) {
        denyBasis =
          `Wanted a panel (${detail}) but the escalation budget is spent: ` +
          `${(wouldBeRate * 100).toFixed(1)}% would exceed the ${(this.cfg.maxEscalationRate * 100).toFixed(1)}% cap. ` +
          'Answered by top-1 instead — this is a cost decision, not a quality one. ' +
          'If this fires often, tighten the FLOORS rather than raising the cap: ' +
          'the cap bounds spend, it does not choose what to spend on.';
      }
    }

    if (denyBasis !== null) {
      this.denied += 1;
      return {
        escalate: false,
        reason,
        rateSoFar: this.escalations / this.decisions,
        budgetDenied: true,
        uncertainty,
        basis: denyBasis,
        decidedAt,
      };
    }

    this.escalations += 1;
    this.reasons[reason] += 1;
    return {
      escalate: true,
      reason,
      rateSoFar: this.escalations / this.decisions,
      budgetDenied: false,
      uncertainty,
      basis: `Escalating to a panel: ${detail}.`,
      decidedAt,
    };
  }

  stats(): EscalationStats {
    return {
      decisions: this.decisions,
      escalations: this.escalations,
      denied: this.denied,
      rate: this.decisions === 0 ? 0 : this.escalations / this.decisions,
      byReason: { ...this.reasons },
    };
  }

  reset(): void {
    this.decisions = 0;
    this.escalations = 0;
    this.denied = 0;
    this.reasons.thin_margin = 0;
    this.reasons.low_earned = 0;
    this.reasons.low_confidence = 0;
  }
}
