// lib/trustshell/ratchet-decay.ts — a floor is held, not owned.
//
// P3 of docs/SPRINT-DECISIONS-2026-08-17.md.
//
// WHAT THE RATCHET DOES TODAY. `trg_repid_earned_floor` keeps `peak_repid`
// monotonically rising and clamps `current_repid` UP to
// `tier_lower_bound(peak_repid)`. So the reward for good behaviour is permanent
// and the cost of bad behaviour is bounded below — an agent farms to a tier once
// and then coasts with a floor underneath it.
//
// WHAT THE CENSUS ACTUALLY SAYS, measured 2026-08-17. The headline "21 agents
// sitting on floors" was loose — it counted agents whose score is a round number.
// The precise test, `current_repid = tier_lower_bound(peak_repid)`, gives:
//
//   12  pinned by the ratchet
//    4  of them human
//    7  of them lifecycle_status='test_only'
//    1  a real, non-human, non-test agent   (trinity-gcm, floor 1000, peak 1035)
//    6  hold a floor having NEVER been observed at all
//
// That last row reframes the problem. **Decay is the smaller half.** Six agents
// hold standing with zero evidence ever recorded — that is not stale standing
// going unrefreshed, it is standing that was never earned, and no decay schedule
// addresses it because there is nothing to decay from. It needs a base case.
//
// SO THERE ARE TWO RULES, and the order matters:
//
//   A  NEVER EARNED. A floor requires at least one observation, ever. Six agents
//      fail this today. `trinity-gcm` passes it — 12 observations in 30 days.
//
//   B  DECAY. Past a re-attestation window, the floor decays toward zero. This
//      is the rule for standing that WAS earned and has gone quiet.
//
// HUMANS ARE EXEMPT, deliberately and narrowly. `compute_tier` already exempts
// `is_human` from the counterparty gate, because a human's standing is not
// earned through agent observations. Applying an observation-driven decay to
// them would demote a human for not behaving like a bot. Four of the twelve are
// human, so this is not a hypothetical carve-out.
//
// THE HALF-LIFE IS BORROWED, NOT INVENTED. `EarnedMetrics.RECENCY_HALF_LIFE_DAYS`
// is 30, and evidence weight already halves on that schedule. A floor that
// decayed on a different clock than the evidence supporting it would drift out of
// step with the score it is supposed to bound.

/** Matches `RECENCY_HALF_LIFE_DAYS` in EarnedMetrics. Same evidence, same clock. */
export const FLOOR_HALF_LIFE_DAYS = 30;

/**
 * Grace before decay starts. An agent is not penalised for a quiet fortnight;
 * the floor is a claim about track record, not about this week's activity.
 */
export const REATTESTATION_WINDOW_DAYS = 30;

export interface FloorInput {
  /** `tier_lower_bound(peak_repid)` — the floor the ratchet grants today. */
  readonly grantedFloor: number;
  /** Total observations ever recorded for this agent. */
  readonly observationsEver: number;
  /** Days since the most recent observation. `null` when there has never been one. */
  readonly daysSinceLastObservation: number | null;
  /** `repid_agents.is_human`. Exempt — see the header. */
  readonly isHuman: boolean;
}

export type FloorVerdict =
  | 'exempt_human'
  | 'never_earned'
  | 'attested'
  | 'decaying'
  | 'lapsed';

export interface FloorDecision {
  readonly verdict: FloorVerdict;
  /** The floor that should apply now. Never above `grantedFloor`. */
  readonly effectiveFloor: number;
  /** Why, in a sentence a verifier can read. */
  readonly reason: string;
}

/**
 * What floor does this agent actually hold?
 *
 * Order is load-bearing: exemption, then never-earned, then recency. Checking
 * recency first would let a never-observed agent look merely "stale" and decay
 * gracefully from a floor it never earned.
 */
export function effectiveFloor(input: FloorInput): FloorDecision {
  const { grantedFloor, observationsEver, daysSinceLastObservation, isHuman } = input;

  if (grantedFloor <= 0) {
    return { verdict: 'never_earned', effectiveFloor: 0, reason: 'no floor granted' };
  }

  if (isHuman) {
    return {
      verdict: 'exempt_human',
      effectiveFloor: grantedFloor,
      reason: 'human standing is not earned through agent observations, and compute_tier already exempts it',
    };
  }

  // RULE A — never earned. Not decay: there is nothing to decay from.
  if (observationsEver === 0 || daysSinceLastObservation === null) {
    return {
      verdict: 'never_earned',
      effectiveFloor: 0,
      reason: 'floor held with zero observations ever recorded — the ratchet granted standing no evidence supports',
    };
  }

  // RULE B — decay, after a grace window.
  if (daysSinceLastObservation <= REATTESTATION_WINDOW_DAYS) {
    return {
      verdict: 'attested',
      effectiveFloor: grantedFloor,
      reason: `attested ${daysSinceLastObservation}d ago, inside the ${REATTESTATION_WINDOW_DAYS}d window`,
    };
  }

  const overdue = daysSinceLastObservation - REATTESTATION_WINDOW_DAYS;
  const decayed = grantedFloor * Math.pow(0.5, overdue / FLOOR_HALF_LIFE_DAYS);
  const floored = Math.floor(decayed);

  if (floored <= 0) {
    return {
      verdict: 'lapsed',
      effectiveFloor: 0,
      reason: `${daysSinceLastObservation}d since the last observation — the floor has decayed to nothing`,
    };
  }

  return {
    verdict: 'decaying',
    effectiveFloor: floored,
    reason:
      `${overdue}d past the ${REATTESTATION_WINDOW_DAYS}d window — floor ${grantedFloor} decayed to ` +
      `${floored} on a ${FLOOR_HALF_LIFE_DAYS}d half-life`,
  };
}

/**
 * Would applying this rule change what the agent holds?
 *
 * Separated from `effectiveFloor` so a migration can report its blast radius
 * before it runs. A rule whose effect nobody measured before applying it is how
 * a scoring change becomes an incident.
 */
export function wouldChange(input: FloorInput): boolean {
  return effectiveFloor(input).effectiveFloor !== input.grantedFloor;
}
