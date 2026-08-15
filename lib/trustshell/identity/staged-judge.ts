// staged-judge.ts — cheap checks first, and a rule for when a cheap answer counts.
//
// ── WHERE THIS CAME FROM ─────────────────────────────────────────────────────
//
// Three independent reads converged on staged evaluation: our own harness
// research, Grok's synthesis, and Ouroboros (`Q00/ouroboros`, 5,421★), which
// ships "Mechanical ($0) → Semantic → Multi-Model Consensus ($$$)" and escalates
// on failure. Convergence from three directions is the closest thing to evidence
// available before the thing exists, so this is the one architectural idea taken
// from that ecosystem rather than merely noted.
//
// ── THE ESCALATION RULE, AND WHY IT IS NOT OUROBOROS'S ───────────────────────
//
// Ouroboros escalates on failure. We do the opposite, and the difference is the
// whole point of this codebase:
//
//     FAILED at any tier is FINAL.
//     VERIFIED and NOT_CHECKED escalate to the next tier.
//
// ── AND ONE MORE, ADDED AFTER MEASURING ──────────────────────────────────────
//
//     A tier that REFERS TO A HUMAN is FINAL too.
//
// That rule is not a refinement of taste. It closes a measured defect
// (`scripts/panel-tier-test.mjs`, 2026-08-15): `bft-judge` returns NOT_CHECKED
// for a fired Pythagorean veto, meaning "the panel's unanimity is itself the
// warning sign — escalate to a human". This module read that same NOT_CHECKED
// as "escalate to the next tier", asked a single model, and got VERIFIED. The
// panel's strongest warning became a pass, and every signature still verified.
//
// The two readings are not reconcilable by ordering the tiers correctly. They
// were reconcilable ONLY while the panel happened to be last, which is a
// property of a config file, not of the code. So the judge now says which it
// meant (`JudgeOpinion.referToHuman`) and staging stops when it hears it.
//
// A referral is not overridable by a later tier BECAUSE the later tier is
// another model, and "ask another model" is precisely what the referring judge
// said was insufficient. Escalating past a referral is the same move as
// escalating past a FAILED — shopping — with a politer name.
//
// A cheap tier that says FAILED has found a concrete defect — the suite is red,
// the file is missing, the policy is violated. Escalating that to a more
// expensive judge is shopping for a better answer, and a system that re-asks
// until it hears yes is the failure this whole repo exists to prevent.
//
// A cheap tier that says VERIFIED has found only that it could not see anything
// wrong, which is a much weaker claim than the word carries. Letting it stand
// would be an unearned green produced by design.
//
// So: **a cheap tier may condemn but may not certify.** That is the same
// asymmetry `requireIndependentEvaluation` already enforces in the kernel, where
// self-evaluation can fail a run but cannot pass one. Applying one rule in two
// places is deliberate; two different rules would be two things to remember.
//
// ── WHAT THIS DOES NOT CLAIM ─────────────────────────────────────────────────
//
// **No cost saving is asserted here, because none has been measured.** The
// saving is bounded by how often a cheap tier can decide FAILED, and that
// fraction is a property of the criteria and the fleet, not of this code. So
// this module RECORDS which tier decided each criterion (`decisions`) and states
// no number. Once real runs exist, the fraction is one query over that record —
// which is the point: the mechanism exists to make the measurement possible, not
// to bank a saving in advance.
//
// Deliberately absent: cost weights, tier prices, and any auto-tuning of the
// order. Ouroboros hardcodes 1× / 10× / 30×. Ours would be a guess wearing a
// policy's clothes, the same reason `maxDisagreement` has no default.

import type { Judge, JudgeOpinion, JudgeRequest } from './contracted-evaluator';
import type { Outcome } from './work-contract';

export interface JudgeTier {
  /** Names the tier in `decisions` and in the opinion detail. Must be unique. */
  name: string;
  judge: Judge;
}

/** Which tier actually decided a criterion, and what it said. */
export interface TierDecision {
  criterionId: string;
  /** The tier whose answer stood. */
  decidedBy: string;
  outcome: Outcome;
  /** Tiers consulted before this one, in order. Empty when the first tier decided. */
  escalatedPast: readonly string[];
  /**
   * Whether this decision is waiting on a human rather than on a judge.
   *
   * ALWAYS PRESENT, never optional. A referral rate that has to be inferred
   * from a missing key cannot be counted, and an absent key reads as `false` to
   * every consumer that does not know better — which is how a referral gets
   * lost a second time, in the measurement instead of the routing.
   */
  referredToHuman: boolean;
}

export interface StagedJudge {
  judge: Judge;
  /**
   * One entry per `judge()` call, in call order.
   *
   * The measurement surface. How often the cheap tier ends it is the number that
   * decides whether staging pays, and it is not knowable in advance.
   */
  decisions: readonly TierDecision[];
}

/**
 * Compose tiers cheapest-first.
 *
 * A tier that throws is treated as NOT_CHECKED and escalates — a provider outage
 * is not a defect report, and must not be able to condemn the work. Its message
 * is preserved in the final detail so an outage is distinguishable from a judge
 * that genuinely could not decide.
 */
export function createStagedJudge(input: { tiers: readonly JudgeTier[] }): StagedJudge {
  const tiers = input.tiers;
  if (tiers.length === 0) {
    throw new Error(
      'a staged judge with no tiers would answer every criterion NOT_CHECKED while ' +
        'looking like a configured judge. Supply at least one tier.'
    );
  }
  const names = new Set(tiers.map((t) => t.name));
  if (names.size !== tiers.length) {
    throw new Error(
      'two tiers share a name, so `decisions` could not say which one decided. ' +
        'Tier names are the measurement key; they must be unique.'
    );
  }

  const decisions: TierDecision[] = [];

  return {
    decisions,
    judge: {
      async judge(request: JudgeRequest): Promise<JudgeOpinion> {
        const escalatedPast: string[] = [];
        const notes: string[] = [];
        let last: JudgeOpinion | undefined;

        for (let i = 0; i < tiers.length; i += 1) {
          const tier = tiers[i];
          const isLast = i === tiers.length - 1;

          let opinion: JudgeOpinion;
          try {
            opinion = await tier.judge.judge(request);
          } catch (e) {
            // An outage cannot condemn. Recorded and escalated.
            notes.push(`${tier.name} threw (${(e as Error).message})`);
            if (isLast) {
              const outcome: Outcome = 'NOT_CHECKED';
              decisions.push({
                criterionId: request.criterion.id,
                decidedBy: tier.name,
                outcome,
                escalatedPast: [...escalatedPast],
                // An outage is not a referral. Nobody judged this and asked for
                // a human; the providers were down. Recording it as a referral
                // would inflate the referral rate with infrastructure noise and
                // hide the one number this field exists to make countable.
                referredToHuman: false,
              });
              return {
                outcome,
                detail: `no tier could judge this: ${notes.join('; ')}`,
              };
            }
            escalatedPast.push(tier.name);
            continue;
          }

          last = opinion;

          const referred = opinion.referToHuman === true;

          // A TIER THAT BOTH CERTIFIED AND REFERRED HAS NOT CERTIFIED. The two
          // halves contradict, and the resolution is always the weaker one — a
          // judge unsure enough to want a human is not a judge whose pass
          // should stand. Weakening here rather than refusing keeps an
          // incoherent judge from taking the run down, which would let a buggy
          // adapter condemn work it never assessed.
          const outcome: Outcome =
            referred && opinion.outcome === 'VERIFIED' ? 'NOT_CHECKED' : opinion.outcome;

          // THE ASYMMETRY. A concrete defect ends it, a referral ends it, and
          // anything else escalates.
          if (outcome === 'FAILED' || referred || isLast) {
            decisions.push({
              criterionId: request.criterion.id,
              decidedBy: tier.name,
              outcome,
              escalatedPast: [...escalatedPast],
              referredToHuman: referred,
            });
            const prefix = notes.length > 0 ? `${notes.join('; ')}; ` : '';
            const contradiction =
              referred && opinion.outcome === 'VERIFIED'
                ? ' — this tier certified AND asked for a human, which is not a certification'
                : '';
            return {
              ...opinion,
              outcome,
              detail: `${prefix}[${tier.name}] ${opinion.detail}${contradiction}`,
            };
          }

          notes.push(`${tier.name} said ${opinion.outcome} and could not certify alone`);
          escalatedPast.push(tier.name);
        }

        // Unreachable: the loop returns on its last iteration. Kept as a refusal
        // rather than a cast, because a silent `undefined` here would surface as
        // a criterion that quietly scored nothing.
        throw new Error(
          `staged judging fell through every tier for '${request.criterion.id}', ` +
            `last opinion ${JSON.stringify(last)}`
        );
      },
    },
  };
}
