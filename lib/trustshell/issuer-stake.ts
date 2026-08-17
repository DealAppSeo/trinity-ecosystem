// lib/trustshell/issuer-stake.ts — the issuer is scored by the standard it applies.
//
// P1 of docs/SPRINT-DECISIONS-2026-08-17.md.
//
// WHY THIS EXISTS
//
// HAL issues verdicts about agents. Nothing scored HAL. Measured 2026-08-17 over
// the 395 usable `fact-check-s2` rows:
//
//   when HAL called a provider   319/336 correct  = 94.9%
//   when it called none           28/59  correct  = 47.5%   ← a coin flip
//
// 41 of those unverified verdicts were VETOES — actionable, and typed
// `veto_class='FACTUAL_ERROR'` — issued having consulted nothing. The cause is an
// incentive, not a bug: verification costs ~3,158ms and a provider call, the
// no-provider path costs 947ms and nothing, and both produce a row that looks
// identical downstream. **The cheap path and the unverified path are the same
// path.**
//
// THE DESIGN CHOICE, AND IT IS THE WHOLE POINT
//
// Cost attaches to the PROCESS, not the outcome. An unearned verdict that
// happens to be correct still costs, because 46.3% of unearned vetoes were
// correct and that is indistinguishable from guessing. Staking the outcome would
// let an issuer buy standing with luck; staking the process cannot be gamed by a
// good draw.
//
// This also makes verification STRICTLY DOMINANT rather than merely favourable.
// If an unearned verdict could earn credit when right, an issuer maximising
// expected value would skip verification whenever `P(correct) * reward` exceeded
// the cost — and at 47.5% that trade is close enough to argue about. At zero
// credit and a fixed penalty there is nothing to argue about.
//
// `estimated_cost_usd` is 0.000000 on every row, earned and unearned alike, so
// the penalty cannot be denominated in spend. It is denominated in the units it
// protects.

/** One issued verdict, reduced to what the stake depends on. */
export interface IssuedVerdict {
  /** Did the issuer attempt ANY verification provider? `providers_attempted`. */
  readonly providerAttempted: boolean;
  /** Did the issuer emit an actionable verdict? `hal_vetoed`. */
  readonly vetoed: boolean;
  /** Ground truth. `ground_truth_is_hallucination`. */
  readonly isHallucination: boolean;
}

export type VerdictClass =
  | 'earned_true_positive'
  | 'earned_true_negative'
  | 'earned_false_positive'
  | 'earned_false_negative'
  | 'unearned_veto'
  | 'unearned_clean';

/**
 * Classify a verdict.
 *
 * Evidence is checked FIRST and outcome second, deliberately: an unearned
 * verdict has no true/false variant, because we are not scoring whether it was
 * right. Collapsing the unearned classes is what makes luck unbankable.
 */
export function classify(v: IssuedVerdict): VerdictClass {
  if (!v.providerAttempted) return v.vetoed ? 'unearned_veto' : 'unearned_clean';
  if (v.vetoed) return v.isHallucination ? 'earned_true_positive' : 'earned_false_positive';
  return v.isHallucination ? 'earned_false_negative' : 'earned_true_negative';
}

/**
 * Points per class.
 *
 * The ratios, and why each is what it is:
 *
 * - **Correct + verified = +1.** The baseline unit. Everything else is priced
 *   against it.
 * - **Wrong + verified = −1.** An honest error, symmetric. An issuer that
 *   verifies and is wrong has done the work and drawn badly; charging it more
 *   than it earns for being right would push it toward never issuing at all.
 * - **Unearned veto = −3.** An actionable verdict with no evidence. Three
 *   because it must exceed the +1 it forgoes AND the −1 of an honest error:
 *   skipping verification has to be worse than verifying and being wrong, or
 *   the cheap path stays rational.
 * - **Unearned clean = −1.** A non-action with no evidence. It withholds a
 *   verdict rather than asserting one, so it is charged as an honest error and
 *   not as an unearned assertion. It is still charged: declining to look is a
 *   choice.
 *
 * These are a STARTING POINT, deliberately round, and the suite pins the
 * consequences so a change to them cannot pass silently.
 */
export const STAKE_POINTS: Readonly<Record<VerdictClass, number>> = {
  earned_true_positive: 1,
  earned_true_negative: 1,
  earned_false_positive: -1,
  earned_false_negative: -1,
  unearned_veto: -3,
  unearned_clean: -1,
};

export interface IssuerStanding {
  readonly total: number;
  readonly counts: Readonly<Record<VerdictClass, number>>;
  /** Net points under STAKE_POINTS. */
  readonly net: number;
  /** Net if every verdict had been verified, at the issuer's own earned accuracy. */
  readonly achievable: number;
  /** `achievable - net` — what skipping verification cost. */
  readonly forgone: number;
  /** Share of achievable standing lost to unearned verdicts. 0 when achievable <= 0. */
  readonly forgoneShare: number;
  /** Accuracy on verdicts where a provider was attempted. `null` if there are none. */
  readonly earnedAccuracy: number | null;
  /** Share of verdicts issued with no provider attempted. */
  readonly unearnedShare: number;
}

const ZERO: Record<VerdictClass, number> = {
  earned_true_positive: 0,
  earned_true_negative: 0,
  earned_false_positive: 0,
  earned_false_negative: 0,
  unearned_veto: 0,
  unearned_clean: 0,
};

/**
 * Score an issuer over its verdicts.
 *
 * `achievable` is the counterfactual that gives the number meaning: what this
 * issuer would have scored had it verified everything, at ITS OWN measured
 * accuracy on the verdicts it did verify. Not at 100% — that would price the
 * stake against perfection nobody reaches, and the resulting "cost" would be
 * mostly the cost of being fallible rather than the cost of not looking.
 */
export function scoreIssuer(verdicts: readonly IssuedVerdict[]): IssuerStanding {
  const counts: Record<VerdictClass, number> = { ...ZERO };
  for (const v of verdicts) counts[classify(v)] += 1;

  const net = (Object.keys(counts) as VerdictClass[]).reduce(
    (sum, k) => sum + counts[k] * STAKE_POINTS[k],
    0
  );

  const earned =
    counts.earned_true_positive +
    counts.earned_true_negative +
    counts.earned_false_positive +
    counts.earned_false_negative;
  const earnedCorrect = counts.earned_true_positive + counts.earned_true_negative;
  const earnedAccuracy = earned > 0 ? earnedCorrect / earned : null;

  const total = verdicts.length;
  const unearned = counts.unearned_veto + counts.unearned_clean;

  // Counterfactual: all `total` verdicts verified, at the issuer's own accuracy.
  const achievable =
    earnedAccuracy === null ? 0 : total * earnedAccuracy * 1 + total * (1 - earnedAccuracy) * -1;

  const forgone = achievable - net;

  return {
    total,
    counts,
    net,
    achievable,
    forgone,
    forgoneShare: achievable > 0 ? forgone / achievable : 0,
    earnedAccuracy,
    unearnedShare: total > 0 ? unearned / total : 0,
  };
}

/**
 * Would this verdict be refused at issue time?
 *
 * The other half of P1 — "make the no-provider path expensive or impossible".
 * The stake makes it expensive after the fact; this makes it impossible at the
 * source. An issuer that attempted no provider may not emit an actionable
 * verdict: NOT_CHECKED is the correct third outcome, and it is the one the
 * runner never had.
 */
export function refusesToIssue(v: Pick<IssuedVerdict, 'providerAttempted' | 'vetoed'>): boolean {
  return !v.providerAttempted && v.vetoed;
}
