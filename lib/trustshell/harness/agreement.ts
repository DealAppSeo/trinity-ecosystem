// lib/trustshell/harness/agreement.ts — do experts fail INDEPENDENTLY?
//
// This module exists because of a measured boundary, not a hunch. An
// escalation-gated panel of 3 measured +4.70pp over top-1 and +2.70pp past what
// any omniscient TOP-1 router could reach — and then measured **-0.85pp**, a net
// loss at 2.77x the cost, once expert errors were correlated through shared task
// difficulty. Same code, same panel, same aggregator. The only thing that
// changed was whether the experts failed on the SAME tasks.
//
// A panel buys independent chances. If two experts get the same questions wrong,
// the second call is not a second chance; it is a second invoice. So whether a
// panel is worth running is not a property of the panel. It is a property of the
// FLEET, it varies by deployment, and until now nothing here measured it.
//
// WHAT IS MEASURED. For every pair of experts observed on the SAME task:
//
//   observed   P(both wrong)
//   expected   P(a wrong) * P(b wrong)      <- what independence would predict
//   lift       observed / expected
//
// Lift 1.0 means independent and a panel pays. Lift rising toward the ceiling of
// `1 / P(b wrong)` means the pair fails together and a panel is close to
// worthless. The ratio is the point: raw co-failure rate is uninformative
// because two bad experts fail together often merely by both being bad.
//
// WHY PAIRWISE AND NOT A SINGLE FLEET NUMBER. Correlation is not uniform. Two
// experts on the same base model fail together; a third on a different stack may
// not. A single fleet-wide average would hide exactly the structure a router
// should exploit — pick a panel from the LEAST correlated experts available, not
// simply the highest-earning ones. `mostIndependentPair` exposes that directly.
//
// THIS ONLY SEES WHAT WAS OBSERVED. A pair is measurable only on tasks where
// both were called, which for a top-1 router is never. The data comes from
// panels, so there is a genuine chicken-and-egg: you need panel observations to
// learn whether panels are worth running. That is an explore/exploit problem and
// it belongs to the caller — this module reports `confident: false` until it has
// evidence, and reports NOTHING rather than guessing a prior. A default of
// "assume independent" would recommend panels in precisely the deployment where
// they lose money, which is the failure this whole file is built to prevent.

import type { ExpertId } from './types';

/** Evidence for one ordered-insensitive pair of experts. */
export interface PairAgreement {
  a: ExpertId;
  b: ExpertId;
  /** Tasks on which BOTH were observed. */
  coObservations: number;
  bothWrong: number;
  aWrong: number;
  bWrong: number;
  /** P(both wrong), measured. */
  observedJoint: number;
  /** P(a wrong) * P(b wrong) — what independence predicts. */
  expectedJoint: number;
  /**
   * observedJoint / expectedJoint. 1 = independent, > 1 = they fail together,
   * < 1 = they fail on complementary tasks (the best case for a panel).
   *
   * Null when neither expert has been observed failing, because the ratio is
   * then 0/0 and any number reported would be invented.
   */
  lift: number | null;
}

export interface AgreementStats {
  tasks: number;
  pairs: number;
  /**
   * Co-observation-weighted mean lift across all measurable pairs. Null when
   * nothing is measurable.
   */
  fleetLift: number | null;
  /** True once at least `minCoObservations` back the estimate. */
  confident: boolean;
  /** Total co-observations behind `fleetLift`. */
  evidence: number;
}

export interface AgreementConfig {
  /**
   * Co-observations required before `confident` is true. A lift computed from
   * a handful of tasks is noise, and acting on it would swing panel policy on
   * nothing.
   */
  minCoObservations?: number;
}

const DEFAULTS: Required<AgreementConfig> = { minCoObservations: 50 };

interface PairCounts {
  n: number;
  bothWrong: number;
  aWrong: number;
  bWrong: number;
}

/**
 * The panel's realised value, measured rather than inferred.
 *
 * WHY THIS EXISTS ALONGSIDE `fleetLift`. Lift was built first, as a proxy for
 * "will a panel help". Validated against a simulator where the true correlation
 * is a knob, it turned out to be a good DETECTOR and a poor DIAL: it moves
 * decisively from 0.77 to 1.77 as correlation appears, then saturates around
 * 2.1-2.3 across the entire region where the panel's real value falls from
 * +3.75pp to -0.85pp. The saturation is structural, not a tuning problem - lift
 * is bounded above by `1 / P(b wrong)`, and that ceiling drops as tasks get
 * harder, cancelling the rise it is supposed to report.
 *
 * A gate built on lift would therefore disable panels in deployments where they
 * still pay. So this measures the decision directly: on tasks where a panel
 * actually ran, how often did the aggregated answer beat the leader's own?
 * That is not a proxy for the gain. It IS the gain, restricted to the tasks
 * where it applies, and it needs no assumption about how errors correlate.
 */
export interface PanelUplift {
  /** Tasks where both a leader answer and an aggregated answer existed. */
  observations: number;
  leaderCorrect: number;
  panelCorrect: number;
  /** Tasks the panel got right that the leader alone got wrong. */
  rescued: number;
  /** Tasks the leader got right that the panel then got wrong. */
  spoiled: number;
  /**
   * panelCorrect/n - leaderCorrect/n, in POINTS. Positive means the panel is
   * earning its extra calls on the tasks it ran. Null without evidence.
   */
  upliftPp: number | null;
  confident: boolean;
}

export class AgreementTracker {
  private readonly cfg: Required<AgreementConfig>;
  /** key `a\u0000b` with a < b, so the pair is order-insensitive. */
  private readonly pairs = new Map<string, PairCounts>();
  private taskCount = 0;
  private panelObs = 0;
  private panelLeaderCorrect = 0;
  private panelAggCorrect = 0;
  private panelRescued = 0;
  private panelSpoiled = 0;

  constructor(config: AgreementConfig = {}) {
    this.cfg = { ...DEFAULTS, ...config };
    if (this.cfg.minCoObservations < 1) {
      throw new Error('minCoObservations must be >= 1');
    }
  }

  private static key(a: ExpertId, b: ExpertId): string {
    return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
  }

  /**
   * Record the outcomes of every expert that answered ONE task.
   *
   * Must be called once per task with all of that task's observations together.
   * Feeding outcomes one at a time cannot work: the whole quantity of interest
   * is whether two experts were wrong about the SAME question, which is
   * unrecoverable once the task boundary is lost.
   *
   * Fewer than two observations contributes nothing and is not an error — a
   * top-1 router produces exactly that, and it should be silently uninformative
   * rather than a failure.
   */
  recordTask(outcomes: ReadonlyArray<{ expert: ExpertId; correct: boolean }>): void {
    this.taskCount += 1;
    if (outcomes.length < 2) return;

    for (let i = 0; i < outcomes.length; i += 1) {
      for (let j = i + 1; j < outcomes.length; j += 1) {
        const x = outcomes[i];
        const y = outcomes[j];
        if (x.expert === y.expert) continue; // same expert twice is not a pair
        const key = AgreementTracker.key(x.expert, y.expert);
        let c = this.pairs.get(key);
        if (!c) {
          c = { n: 0, bothWrong: 0, aWrong: 0, bWrong: 0 };
          this.pairs.set(key, c);
        }
        // `a` is always the lexicographically smaller id, so the counts stay
        // consistent no matter which order the caller supplied them in.
        const [first] = key.split('\u0000');
        const xIsA = x.expert === first;
        const aWrong = xIsA ? !x.correct : !y.correct;
        const bWrong = xIsA ? !y.correct : !x.correct;
        c.n += 1;
        if (aWrong) c.aWrong += 1;
        if (bWrong) c.bWrong += 1;
        if (aWrong && bWrong) c.bothWrong += 1;
      }
    }
  }

  private static liftOf(c: PairCounts): number | null {
    if (c.n === 0) return null;
    const pa = c.aWrong / c.n;
    const pb = c.bWrong / c.n;
    const expected = pa * pb;
    // Nobody failed, so there is no failure correlation to speak of. Reporting
    // 1.0 ("independent") would be an assertion about evidence that does not
    // exist.
    if (expected === 0) return null;
    return c.bothWrong / c.n / expected;
  }

  /** Every measurable pair, most-correlated first. */
  pairAgreements(): PairAgreement[] {
    const out: PairAgreement[] = [];
    for (const [key, c] of this.pairs) {
      const [a, b] = key.split('\u0000');
      out.push({
        a,
        b,
        coObservations: c.n,
        bothWrong: c.bothWrong,
        aWrong: c.aWrong,
        bWrong: c.bWrong,
        observedJoint: c.n === 0 ? 0 : c.bothWrong / c.n,
        expectedJoint: c.n === 0 ? 0 : (c.aWrong / c.n) * (c.bWrong / c.n),
        lift: AgreementTracker.liftOf(c),
      });
    }
    return out.sort(
      (p, q) => (q.lift ?? -Infinity) - (p.lift ?? -Infinity) || (p.a < q.a ? -1 : p.a > q.a ? 1 : 0)
    );
  }

  /**
   * The pair that fails together LEAST — the best two-expert panel available on
   * the evidence, which is not generally the two highest-earning experts.
   */
  mostIndependentPair(): PairAgreement | null {
    const measurable = this.pairAgreements().filter((p) => p.lift !== null);
    return measurable.length === 0 ? null : measurable[measurable.length - 1];
  }

  /**
   * Record what a panel actually bought on one task.
   *
   * `leaderCorrect` is whether the top-1 pick alone would have been right;
   * `panelCorrect` is whether the aggregated answer was. Both are known to a
   * caller running a panel at no extra cost, because the leader's proposal is
   * already one of the panel's proposals - measuring this requires no second
   * call and no counterfactual re-run.
   */
  recordPanelOutcome(leaderCorrect: boolean, panelCorrect: boolean): void {
    this.panelObs += 1;
    if (leaderCorrect) this.panelLeaderCorrect += 1;
    if (panelCorrect) this.panelAggCorrect += 1;
    if (!leaderCorrect && panelCorrect) this.panelRescued += 1;
    if (leaderCorrect && !panelCorrect) this.panelSpoiled += 1;
  }

  /**
   * What the panel is actually worth on the tasks it ran.
   *
   * `rescued` and `spoiled` are reported separately rather than only as a net,
   * because they are different problems. A panel that rescues 200 and spoils
   * 190 nets +10 and is a coin flip dressed as a mechanism; one that rescues 60
   * and spoils 0 nets less and is strictly better. A single net figure hides
   * that distinction, which is the kind of collapse this codebase keeps finding.
   */
  panelUplift(): PanelUplift {
    const n = this.panelObs;
    return {
      observations: n,
      leaderCorrect: this.panelLeaderCorrect,
      panelCorrect: this.panelAggCorrect,
      rescued: this.panelRescued,
      spoiled: this.panelSpoiled,
      upliftPp: n === 0 ? null : ((this.panelAggCorrect - this.panelLeaderCorrect) / n) * 100,
      confident: n >= this.cfg.minCoObservations,
    };
  }

  stats(): AgreementStats {
    let weighted = 0;
    let evidence = 0;
    let measurable = 0;
    for (const c of this.pairs.values()) {
      const lift = AgreementTracker.liftOf(c);
      if (lift === null) continue;
      measurable += 1;
      weighted += lift * c.n;
      evidence += c.n;
    }
    return {
      tasks: this.taskCount,
      pairs: this.pairs.size,
      fleetLift: evidence === 0 ? null : weighted / evidence,
      confident: evidence >= this.cfg.minCoObservations && measurable > 0,
      evidence,
    };
  }

  reset(): void {
    this.pairs.clear();
    this.taskCount = 0;
    this.panelObs = 0;
    this.panelLeaderCorrect = 0;
    this.panelAggCorrect = 0;
    this.panelRescued = 0;
    this.panelSpoiled = 0;
  }
}

/**
 * Whether to run a panel on THIS task, learned from what panels have paid.
 *
 * The problem this solves is a genuine chicken-and-egg, not a tuning knob. A
 * pair's uplift is measurable only on tasks where a panel actually ran, so a
 * system that switches panels off stops learning whether it was right to. Left
 * alone that is a one-way door: one unlucky warmup and panels never run again,
 * whatever the fleet later does.
 *
 * So exploration never stops. Even while exploiting a "panels do not pay"
 * verdict, a fixed share of tasks still runs one, purely to keep the estimate
 * alive. That share is the standing cost of being able to change your mind, and
 * it is charged visibly rather than hidden in the headline.
 *
 * DETERMINISTIC, NOT RANDOM. Exploration fires on a counter, not an RNG. The
 * portability check forbids runtime globals, and a counter is exactly
 * reproducible under replay — two runs of the same workload make the same
 * decisions, which is what makes a regression in this policy debuggable at all.
 *
 * WHAT IT GATES ON. `panelUplift`, never `fleetLift`. Lift saturates: measured
 * against a simulator where the true correlation is a knob, it reads 2.14 where
 * a panel still pays +3.75pp and 2.28 where the panel LOSES 0.85pp. A threshold
 * on it fires in the wrong place. Uplift is the quantity itself.
 */
export interface PanelPolicyConfig {
  /** Panels to run before trusting the estimate. Every task panels until then. */
  warmupPanels?: number;
  /**
   * Minimum measured uplift, in points, to keep panelling. Above 0 on purpose:
   * a panel that breaks even is not free, it costs its extra calls.
   */
  minUpliftPp?: number;
  /**
   * Share of tasks that panel anyway while the verdict is "do not". 0 disables
   * re-learning entirely and makes the decision permanent — allowed, but it
   * must be chosen, not defaulted into.
   */
  explorationRate?: number;
}

export type PanelMode = 'warmup' | 'exploit' | 'explore' | 'declined';

export interface PanelDecision {
  panel: boolean;
  mode: PanelMode;
  /** Measured uplift the decision was taken on. Null during warmup. */
  upliftPp: number | null;
  basis: string;
}

const POLICY_DEFAULTS: Required<PanelPolicyConfig> = {
  warmupPanels: 100,
  minUpliftPp: 0.5,
  explorationRate: 0.05,
};

export class AdaptivePanelPolicy {
  private readonly cfg: Required<PanelPolicyConfig>;
  private decisions = 0;
  private explorations = 0;

  constructor(
    private readonly tracker: AgreementTracker,
    config: PanelPolicyConfig = {}
  ) {
    this.cfg = { ...POLICY_DEFAULTS, ...config };
    if (this.cfg.warmupPanels < 0) throw new Error('warmupPanels must be >= 0');
    if (this.cfg.explorationRate < 0 || this.cfg.explorationRate > 1) {
      throw new Error('explorationRate must be in [0, 1]');
    }
  }

  decide(): PanelDecision {
    this.decisions += 1;
    const u = this.tracker.panelUplift();

    if (u.observations < this.cfg.warmupPanels) {
      return {
        panel: true,
        mode: 'warmup',
        upliftPp: u.upliftPp,
        basis:
          `Warming up: ${u.observations}/${this.cfg.warmupPanels} panels observed. ` +
          'Panelling every task until there is enough evidence to judge whether it pays.',
      };
    }

    if (u.upliftPp !== null && u.upliftPp >= this.cfg.minUpliftPp) {
      return {
        panel: true,
        mode: 'exploit',
        upliftPp: u.upliftPp,
        basis:
          `Panels are paying: measured ${u.upliftPp.toFixed(2)}pp uplift over the leader ` +
          `across ${u.observations} panels (rescued ${u.rescued}, spoiled ${u.spoiled}).`,
      };
    }

    // The verdict is "do not panel". Keep a trickle running anyway, or the
    // estimate freezes at whatever it happened to be when we stopped.
    if (this.cfg.explorationRate > 0) {
      const wouldBeRate = (this.explorations + 1) / this.decisions;
      if (wouldBeRate <= this.cfg.explorationRate) {
        this.explorations += 1;
        return {
          panel: true,
          mode: 'explore',
          upliftPp: u.upliftPp,
          basis:
            `Panels are NOT paying (${u.upliftPp === null ? 'no estimate' : u.upliftPp.toFixed(2) + 'pp'}), ` +
            `but running one anyway to keep the estimate alive — ` +
            `${(this.cfg.explorationRate * 100).toFixed(0)}% exploration budget.`,
        };
      }
    }

    return {
      panel: false,
      mode: 'declined',
      upliftPp: u.upliftPp,
      basis:
        `Panels are not paying: measured ` +
        `${u.upliftPp === null ? 'no uplift' : u.upliftPp.toFixed(2) + 'pp'} against a ` +
        `${this.cfg.minUpliftPp}pp floor, over ${u.observations} panels ` +
        `(rescued ${u.rescued}, spoiled ${u.spoiled}). Answering with top-1 and saving the calls.`,
    };
  }

  stats(): { decisions: number; explorations: number; explorationRate: number } {
    return {
      decisions: this.decisions,
      explorations: this.explorations,
      explorationRate: this.decisions === 0 ? 0 : this.explorations / this.decisions,
    };
  }
}
