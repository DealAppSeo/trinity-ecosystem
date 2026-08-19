// lib/trustshell/harness/aggregate.ts — weighted-plurality answer aggregation.
//
// The MoA aggregator. Sibling to `quorum.ts`, and deliberately NOT the same
// thing — conflating them was measured and cost 13.8 points of correctness.
//
//   quorum.ts   asks "do enough trusted validators agree that we should COMMIT?"
//               and fails closed: no supermajority means INDETERMINATE.
//   aggregate.ts asks "given K proposals, which answer do we RETURN?" and picks
//               the heaviest cluster.
//
// Wiring a panel through the quorum scored 77.9% against top-1's 91.8%, because
// per 2000 tasks it produced ~16 REJECT rounds and ~424 INDETERMINATE — the
// panel almost never agreed on a *wrong* answer, it just failed to clear 2/3,
// and a gate that abstains was being counted as wrong. The identical votes
// scored by plurality gave 95.4%. That gap is this file.
//
// WHAT THIS ADDS TO THE PUBLISHED MoA WORK. MoA aggregates uniformly, or by a
// learned gate trained on outputs. Neither has any notion of a proposer that
// lies. Here the weight is `earnedScore` — ledger-derived, evidence-shrunk, and
// unreachable from self-report — so a confident proposer with no track record
// cannot buy influence over the answer. That is the whole thesis applied to
// aggregation rather than routing.
//
// FOUR THINGS THAT LOOK LIKE SUCCESS AND ARE NOT:
//
//   * BREAKING A TIE ARBITRARILY. Two clusters at identical weight is a
//     coin flip; returning either one and calling it decided reports a guess as
//     a result. `minMargin` makes it abstain and say so.
//   * TREATING ONE PROPOSAL AS UNANIMOUS. A single proposal has 100% support by
//     construction. That number is true and worthless, so `minProposals` exists
//     and the result carries the count.
//   * A SINGLE HEAVY EXPERT DOMINATING. If one expert's weight exceeds all
//     others combined, the "panel" returns exactly what top-1 would have
//     returned, at K times the cost. That is not a defect, but a caller paying
//     for a panel deserves to know it bought nothing — `dominatedBySingleExpert`
//     says so.
//   * NON-DETERMINISTIC ORDERING. Equal-weight clusters compared by insertion
//     order give different answers for identical input across runs. Ordering is
//     total: weight descending, then key ascending.

import { BPS_MAX, type Bps, type Clock, type ExpertId } from './types';

/**
 * One expert's answer.
 *
 * `key` is what makes two answers "the same". The caller supplies it — a hash,
 * a normalised string, a semantic cluster id — because only the caller knows
 * what equivalence means for its payload. Aggregation cannot infer it.
 */
export interface Proposal<T> {
  expert: ExpertId;
  /** Answers sharing a key are counted as the same answer. */
  key: string;
  answer: T;
  /** LEDGER-DERIVED earned reputation, 0..10000. Never self-reported. */
  earnedScore: Bps;
  /** True when the expert declined. Abstentions never pick a winner. */
  abstained?: boolean;
}

export type AggregateOutcome = 'DECIDED' | 'ABSTAINED' | 'NO_PROPOSALS';

export interface AggregateConfig {
  /**
   * Minimum share of deciding weight the winner must hold, 0..1.
   * 0 is pure plurality — the heaviest cluster wins however thin its lead.
   */
  minSupport?: number;
  /**
   * Minimum share-point lead over the runner-up. Guards the coin flip: a
   * winner that beats second place by nothing has not been chosen, it has been
   * picked. Default 0.
   */
  minMargin?: number;
  /** Deciding proposals required before an answer can be returned at all. */
  minProposals?: number;
}

export interface Cluster {
  key: string;
  weight: number;
  /** Share of deciding weight, 0..1. */
  share: number;
  experts: ExpertId[];
}

export interface AggregateResult<T> {
  outcome: AggregateOutcome;
  /** The winning answer, or null when not DECIDED. */
  answer: T | null;
  key: string | null;
  /** Winning cluster's share of deciding weight, 0..1. */
  support: number;
  /** Winner's lead over the runner-up in share points. 1 when unopposed. */
  margin: number;
  /** Every cluster, heaviest first. Ordering is total and deterministic. */
  clusters: Cluster[];
  /** Deciding (non-abstaining, non-equivocating) proposals counted. */
  proposalsCounted: number;
  abstainWeight: number;
  /** Experts that proposed more than once. All their proposals are dropped. */
  equivocators: ExpertId[];
  /**
   * True when ONE proposer's weight exceeds all other deciding weight combined,
   * so top-1 routing would have returned the same answer and the panel bought
   * nothing for its K calls.
   *
   * This measures a single EXPERT, not the winning cluster. The first version
   * compared the winning cluster against the rest and called the field
   * `dominatedBySingle`; a two-expert bloc at 3000+3000 beating a lone 5000
   * then reported `true`, which is the opposite of the truth — that panel is
   * exactly the case where combining mattered. The name and the computation
   * disagreed, and a caller reading the flag would have been misinformed.
   */
  dominatedBySingleExpert: boolean;
  /** Why this outcome, in plain language. */
  basis: string;
  decidedAt: number;
}

const DEFAULTS: Required<AggregateConfig> = {
  minSupport: 0,
  minMargin: 0,
  minProposals: 2,
};

export class PluralityAggregator {
  private readonly cfg: Required<AggregateConfig>;

  constructor(
    private readonly clock: Clock,
    config: AggregateConfig = {}
  ) {
    this.cfg = { ...DEFAULTS, ...config };
    if (this.cfg.minSupport < 0 || this.cfg.minSupport > 1) {
      throw new Error('minSupport must be in [0, 1]');
    }
    if (this.cfg.minMargin < 0 || this.cfg.minMargin > 1) {
      throw new Error('minMargin must be in [0, 1]');
    }
    if (this.cfg.minProposals < 1) throw new Error('minProposals must be >= 1');
  }

  aggregate<T>(proposals: Proposal<T>[]): AggregateResult<T> {
    const decidedAt = this.clock.now();

    // Equivocation, handled exactly as quorum.ts does: an expert that proposes
    // twice has told us its proposals are unreliable, so keeping either one is
    // a choice we cannot justify. Consistency with the sibling module is
    // deliberate — two modules disagreeing about what equivocation means is how
    // a caller ends up with two different answers from one panel.
    const seen = new Map<ExpertId, number>();
    for (const p of proposals) seen.set(p.expert, (seen.get(p.expert) ?? 0) + 1);
    const equivocators = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
    const equivocatorSet = new Set(equivocators);
    const counted = proposals.filter((p) => !equivocatorSet.has(p.expert));

    const clamp = (s: Bps) => Math.max(0, Math.min(BPS_MAX, s));

    let abstainWeight = 0;
    const byKey = new Map<string, { weight: number; experts: ExpertId[]; answer: T }>();
    for (const p of counted) {
      const w = clamp(p.earnedScore);
      if (p.abstained) {
        abstainWeight += w;
        continue;
      }
      const c = byKey.get(p.key);
      if (c) {
        c.weight += w;
        c.experts.push(p.expert);
      } else {
        byKey.set(p.key, { weight: w, experts: [p.expert], answer: p.answer });
      }
    }

    const decidingWeight = [...byKey.values()].reduce((a, c) => a + c.weight, 0);
    const proposalsCounted = counted.filter((p) => !p.abstained).length;

    // Total ordering: weight descending, then key ascending. Without the second
    // key, equal-weight clusters fall back to Map insertion order and identical
    // input can yield different answers on different runs.
    const clusters: Cluster[] = [...byKey.entries()]
      .map(([key, c]) => ({
        key,
        weight: c.weight,
        share: decidingWeight === 0 ? 0 : c.weight / decidingWeight,
        experts: [...c.experts].sort(),
      }))
      .sort((a, b) => (b.weight - a.weight) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

    const bail = (outcome: AggregateOutcome, basis: string): AggregateResult<T> => ({
      outcome,
      answer: null,
      key: null,
      support: clusters.length > 0 ? clusters[0].share : 0,
      margin: 0,
      clusters,
      proposalsCounted,
      abstainWeight,
      equivocators,
      dominatedBySingleExpert: false,
      basis,
      decidedAt,
    });

    if (clusters.length === 0) {
      return bail(
        'NO_PROPOSALS',
        proposals.length === 0
          ? 'No proposals were supplied.'
          : `All ${proposals.length} proposal(s) abstained or equivocated; nothing to aggregate.`
      );
    }

    if (proposalsCounted < this.cfg.minProposals) {
      return bail(
        'ABSTAINED',
        `Only ${proposalsCounted} deciding proposal(s); ${this.cfg.minProposals} required. ` +
          'A lone proposal has 100% support by construction, which is true and says nothing.'
      );
    }

    const winner = clusters[0];
    const runnerUp = clusters[1];
    const margin = runnerUp ? winner.share - runnerUp.share : 1;

    if (winner.share < this.cfg.minSupport) {
      return bail(
        'ABSTAINED',
        `Leading answer holds ${(winner.share * 100).toFixed(1)}% of deciding weight, ` +
          `below the ${(this.cfg.minSupport * 100).toFixed(1)}% required.`
      );
    }

    if (margin < this.cfg.minMargin) {
      return bail(
        'ABSTAINED',
        `Leading answer beats the runner-up by ${(margin * 100).toFixed(1)} share points, ` +
          `under the ${(this.cfg.minMargin * 100).toFixed(1)} required. ` +
          'Returning it would report a coin flip as a decision.'
      );
    }

    // Single-expert dominance: the heaviest INDIVIDUAL proposal against
    // everything else. Deliberately not cluster-level — see the field doc.
    let heaviestSingle = 0;
    for (const q of counted) {
      if (q.abstained) continue;
      heaviestSingle = Math.max(heaviestSingle, clamp(q.earnedScore));
    }
    const dominatedBySingleExpert = heaviestSingle > decidingWeight - heaviestSingle;

    return {
      outcome: 'DECIDED',
      answer: byKey.get(winner.key)!.answer,
      key: winner.key,
      support: winner.share,
      margin,
      clusters,
      proposalsCounted,
      abstainWeight,
      equivocators,
      dominatedBySingleExpert,
      basis:
        `'${winner.key}' wins with ${(winner.share * 100).toFixed(1)}% of deciding weight ` +
        `across ${winner.experts.length} of ${proposalsCounted} proposal(s), ` +
        `${(margin * 100).toFixed(1)} share points clear of ${runnerUp ? `'${runnerUp.key}'` : 'nothing'}.` +
        (dominatedBySingleExpert
          ? ' NOTE: one proposer outweighs all others combined, so top-1 routing would have returned this same answer and the panel bought nothing.'
          : '') +
        (equivocators.length > 0 ? ` Dropped ${equivocators.length} equivocator(s).` : ''),
      decidedAt,
    };
  }
}
