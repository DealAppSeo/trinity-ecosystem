// lib/trustshell/repid-floor-decay.ts — decay-unless-re-earned for the RepID
// ratchet floor.
//
// ZERO IMPORTS, same reason as `repid-scoring.ts`: the things that would consume
// this reach Supabase through the `@/` alias and cannot be compiled standalone,
// so a module that cannot be tested is a module that will not be checked.
//
// **NOTHING IS WIRED TO THIS.** No trigger calls it, no route calls it, and it
// writes nothing. It is the decidable half of a design whose other half cannot
// be decided yet — see THE RATE IS NOT CALIBRATABLE below.
//
// ── WHAT THE RATCHET DOES TODAY ─────────────────────────────────────────────
//
// `trg_repid_earned_floor()` on `repid_agents`, mapped by #81:
//
//   NEW.peak_repid := greatest(NEW.peak_repid, OLD.peak_repid, NEW.current_repid);
//   v_floor := coalesce(NEW.floor_override, tier_lower_bound(NEW.peak_repid));
//   IF NEW.current_repid < v_floor THEN NEW.current_repid := v_floor; END IF;
//
// `peak_repid` only rises, and `current_repid` is clamped UP to the lower bound
// of the highest tier ever held. An agent that once reached 8000 can never score
// below 8000 again, however it behaves. A penalty is reversible; an inflation is
// permanent.
//
// ── WHAT "DECAY-UNLESS-RE-EARNED" MEANS HERE ────────────────────────────────
//
// A floor is a claim that the agent HAS a level. That claim ages. The proposal
// is not that standing rots on a timer — it is that a floor persists only while
// the agent keeps demonstrating the level that earned it, and otherwise steps
// down one tier at a time.
//
// Three invariants make it safe, and they are the design:
//
// 1. **DECAY MOVES THE FLOOR, NEVER THE SCORE.** The score changes only through
//    scored events, which are the audit trail. A decay that edited
//    `current_repid` would manufacture reputation movement no event explains —
//    the same defect as a limit that changes because a writer touched a row.
//    Lowering the floor lets a FUTURE penalty land; it does not itself penalise.
//    That is why `decide()` returns a floor and never a score.
//
// 2. **IT STEPS BY TIER, NOT CONTINUOUSLY.** A floor at 7,431 is not a fact
//    anybody can act on, and a continuously-drifting floor is unobservable
//    between reads. One tier boundary at a time is legible, and it is the same
//    granularity the ladder already uses.
//
// 3. **IT NEVER FALLS BELOW THE LEVEL CURRENTLY DEMONSTRATED.** If the live
//    score is above the decayed floor, the floor stops there. Decay removes a
//    claim the agent is no longer supporting; it cannot contradict one it is.
//
// ── THE RATE IS NOT CALIBRATABLE, AND THAT IS A MEASUREMENT, NOT A GAP ──────
//
// The obvious knob is "how long before a floor decays". It cannot be chosen from
// this fleet. Measured 2026-08-17 across all 176 rows of `repid_agents`:
//
//   21 sit exactly on a floor value — the population this was scoped against
//   20 of those 21 are mock/smoke/dry-run rows, `test_only`, or named `HUMAN`
//    9 have `peak_repid` NULL, so no ratchet applies to them at all
//    1 is genuinely ratcheted: `trinity-gcm`, peak 1035 against a floor of 1000
//
// So the ratchet binds ONE real agent, by 35 points, 3.4% and nowhere near a
// tier boundary. A half-life fitted to that is a half-life fitted to one point,
// and the other twenty are fixtures. `staleAfterMs` is therefore REQUIRED with
// no default — the same refusal `retry.ts` makes for `retryOn` and
// `contracted-evaluator.ts` for `maxDisagreement`. A default here would be a
// guess wearing a policy's clothes, and it would silently govern every agent.
//
// ── THE HUMAN EXEMPTION, AND WHY IT IS NOT A COURTESY ───────────────────────
//
// `compute_tier(p_repid, p_agent_id)` returns the base tier for a human BEFORE
// it consults `count_unique_counterparties` [VERIFIED 2026-08-17 against
// `pg_get_functiondef`]:
//
//   SELECT is_human INTO v_is_human FROM repid_agents WHERE id = p_agent_id;
//   IF COALESCE(v_is_human, false) THEN RETURN base_tier; END IF;
//
// The database already holds that a human's standing is not established by
// agent-to-agent observation. Decay is an observation-driven rule, so applying
// it to humans would demote a human for not behaving like a bot — and it would
// do so on the same population the ratchet already pins: **4 of the 12
// ratcheted rows are `is_human`**, and one of them last shows evidence 40 days
// ago. This is not a hypothetical carve-out; without it the first thing a wired
// decay does is expire four humans.
//
// THE ORDER IS THE RULE. The exemption is checked BEFORE the unknown-age
// branch. `lastReEarnedAt` has no column behind it, so in production every row
// arrives null — a human checked after that branch is `not_checked` forever,
// and an operator draining a NOT_CHECKED backlog would "fix" it by inventing
// re-attestation timestamps for people. Exempt means the question is not asked.
//
// ── WHICH RECENCY SOURCE IS ADMISSIBLE, MEASURED ────────────────────────────
//
// Whatever eventually feeds `lastReEarnedAt`, it may not be
// `repid_agents.last_active_at`. Measured 2026-08-17 across all 176 rows:
//
//   last_active_at written                    32 of 176   (18.2%)
//   last_active_at within 30 days             17
//   agents with ANY observation, ever        123
//   agents observed within 30 days            67
//
// The column reports 17 recently-active agents where the evidence shows 67, and
// on the 12 ratcheted rows it is NULL on 11. It is written by exactly one
// database function — `apply_linked_bet_resolution` — and by ZERO lines of this
// repo, so it is a side effect of one narrow flow rather than an activity
// signal. A decay keyed on it expires standing for agents that are demonstrably
// active, fail-open in the direction that costs someone their tier.
//
// The admissible source is `v_agent_earned_observations`, and it joins on
// **`repid_agents.id` (uuid)** — NOT `repid_agents.agent_id`, which is `text`
// and uuid-shaped on **0 of 176** rows. The two identifier spaces are disjoint,
// so the wrong key returns an empty set rather than an error, and every agent
// reads as never-observed. `EarnedMetricsRepo` resolves `id` and is correct;
// `check:observation-identity` keeps it that way.
//
// ── ONE RETRACTED FIGURE, AND ITS CAUSE IS UNVERIFIED ───────────────────────
//
// A previous P3 module opened with "**6** floor-holders have never been observed
// at all" and built a `never_earned` base case on it. Re-measured on the uuid
// key, **no window reproduces 6**:
//
//   no observation EVER        3   — and all three are `lifecycle_status='test_only'`
//   none in the last 30 days   4
//   none in the last 120 days  3
//
// The figure is RETRACTED and gated. **Its cause is NOT established**: the
// originating query was not preserved, and the obvious suspect — the text/uuid
// key mix-up above — does not explain it, because that mistake returns zero
// observations for EVERY agent, which would have given 12, not 6. Recording the
// hazard and the retraction separately, rather than assuming one caused the
// other, because a tidy causal story is exactly what this repo keeps having to
// withdraw.
//
// What follows from the corrected number is the part that matters: **no real
// agent holds a floor with zero evidence.** The never-earned base case reached
// mock rows only, so decay is the whole of the defect rather than its smaller
// half, and P3 needs no base case. See LESSONS A28.
//
// ── AND THERE IS NO EXISTING DECAY TO EXTEND ────────────────────────────────
//
// Worth stating because the names suggest otherwise, and a reader who greps will
// conclude the opposite [VERIFIED 2026-08-17]:
//
//   * `repid_agents.decay_rate` is 0.0015 on all 176 rows and is read by ZERO
//     database functions and ZERO lines of this repo.
//   * `apply_repid_decay()` exists and decays `aidebate_users.repid_balance` —
//     a different product's table. It never touches `repid_agents`.
//   * It is not scheduled: no `cron.job` matches decay.
//
// Nothing decays on the agent path today.

/** Tier floors of the DATABASE ladder, which is not the TIER_LIMITS ladder. */
export const DB_TIER_FLOORS: readonly { tier: string; floor: number }[] = [
  { tier: 'VETERAN', floor: 8000 },
  { tier: 'AUTONOMOUS', floor: 5000 },
  { tier: 'ESTABLISHED', floor: 1000 },
  { tier: 'EARNING', floor: 500 },
  { tier: 'PROBATIONARY', floor: 0 },
];

/**
 * WHICH LADDER THIS IS, stated because using the wrong one is the live hazard.
 *
 * #81 measured TWO tier ladders alive at once: the database's
 * VETERAN/AUTONOMOUS/ESTABLISHED/EARNING/PROBATIONARY at 8000/5000/1000/500, and
 * `repid-scoring.ts`'s Platinum/Gold/Silver/Bronze at 7500/5000/2500/0. They
 * agree on exactly one boundary. The ratchet is a DATABASE mechanism, so this
 * module uses the DATABASE ladder — and says so, because "the tier" is ambiguous
 * in this codebase and every claim about tiers has to name which.
 */
export function dbTierFloorFor(score: number): number {
  if (typeof score !== 'number' || !Number.isFinite(score)) return 0;
  for (const { floor } of DB_TIER_FLOORS) {
    if (score >= floor) return floor;
  }
  return 0;
}

/** The next floor DOWN from `floor`. Returns 0 at the bottom; never negative. */
export function nextFloorBelow(floor: number): number {
  const below = DB_TIER_FLOORS.filter((t) => t.floor < floor);
  return below.length === 0 ? 0 : Math.max(...below.map((t) => t.floor));
}

export interface FloorDecayConfig {
  /**
   * REQUIRED. How long a floor may stand without being re-earned. See the header
   * for why there is no default: it cannot be calibrated from this fleet.
   */
  readonly staleAfterMs: number;
  /**
   * Steps allowed in one evaluation. `1` by construction of the invariant, and
   * configurable only so a backfill can state a larger number EXPLICITLY rather
   * than by looping and hiding it.
   */
  readonly maxStepsPerEvaluation: number;
}

export interface FloorState {
  /** Highest score ever reached. The ratchet's input today. */
  readonly peakRepid: number;
  /** The score right now — what the agent is currently demonstrating. */
  readonly currentRepid: number;
  /** The floor in force. Usually `dbTierFloorFor(peakRepid)`. */
  readonly floor: number;
  /**
   * When the floor's own level was last DEMONSTRATED — the last time the score
   * reached this floor without being clamped there. `null` means unknown, which
   * is NOT the same as "long ago".
   */
  readonly lastReEarnedAt: number | null;
  /**
   * `repid_agents.is_human`. REQUIRED, not defaulted: a caller that forgets it
   * would silently decay a person, and the same refusal is why `staleAfterMs`
   * has no default. See THE HUMAN EXEMPTION in the header.
   */
  readonly isHuman: boolean;
}

export type FloorDecision =
  | { readonly kind: 'holds'; readonly floor: number; readonly reason: string }
  | {
      readonly kind: 'decays';
      readonly from: number;
      readonly to: number;
      readonly reason: string;
    }
  | { readonly kind: 'not_checked'; readonly floor: number; readonly reason: string };

/**
 * Should this floor stand, step down, or is the question unanswerable?
 *
 * Pure. Returns a decision; writes nothing, and deliberately cannot — see
 * invariant 1 in the header.
 *
 * THREE OUTCOMES. `not_checked` is not decoration: `lastReEarnedAt` is null for
 * most rows today, and an unknown last-demonstration is the single most likely
 * input in production. Folding it into `decays` would expire floors for want of
 * a timestamp nobody wrote; folding it into `holds` would report a floor as
 * examined-and-sound when it was never examined. Both are the two-outcome
 * mistake this repo keeps paying for, in opposite directions.
 */
export function decideFloor(state: FloorState, now: number, cfg: FloorDecayConfig): FloorDecision {
  if (typeof cfg.staleAfterMs !== 'number' || !Number.isFinite(cfg.staleAfterMs) || cfg.staleAfterMs <= 0) {
    throw new Error('staleAfterMs is required and must be > 0 — there is no safe default; see the header');
  }
  if (!Number.isInteger(cfg.maxStepsPerEvaluation) || cfg.maxStepsPerEvaluation < 1) {
    throw new Error('maxStepsPerEvaluation must be an integer >= 1');
  }
  for (const [name, v] of [
    ['peakRepid', state.peakRepid],
    ['currentRepid', state.currentRepid],
    ['floor', state.floor],
    ['now', now],
  ] as const) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      return { kind: 'not_checked', floor: state.floor, reason: `${name} is not a finite number` };
    }
  }

  if (state.floor <= 0) {
    return { kind: 'holds', floor: state.floor, reason: 'already at the bottom of the ladder; nothing to decay' };
  }

  // THE HUMAN EXEMPTION, CHECKED BEFORE THE CLOCK AND BEFORE THE UNKNOWN-AGE
  // BRANCH. `compute_tier` already exempts `is_human` from its counterparty
  // gate; decay is the same kind of observation-driven rule. Placing this after
  // the `lastReEarnedAt === null` branch would return `not_checked` for every
  // human forever, since no column feeds that field — and a NOT_CHECKED backlog
  // invites someone to invent re-attestation timestamps for people.
  if (state.isHuman) {
    return {
      kind: 'holds',
      floor: state.floor,
      reason:
        'is_human — a human\'s standing is not established by agent observations, and compute_tier ' +
        'already exempts them from the counterparty gate. Exempt means the question is not asked.',
    };
  }

  // INVARIANT 3, CHECKED FIRST. An agent scoring at or above its floor is
  // demonstrating the level right now, and no elapsed time changes that. Asking
  // the clock first would expire a floor an active agent is actively holding.
  if (state.currentRepid >= state.floor) {
    return {
      kind: 'holds',
      floor: state.floor,
      reason: `current ${state.currentRepid} is at or above the floor — the level is being demonstrated now`,
    };
  }

  if (state.lastReEarnedAt === null || !Number.isFinite(state.lastReEarnedAt)) {
    return {
      kind: 'not_checked',
      floor: state.floor,
      reason:
        'the floor has no recorded last-demonstration, so its age is UNKNOWN. Decaying on an ' +
        'absent timestamp would expire a floor for want of a column nobody wrote.',
    };
  }

  const age = now - state.lastReEarnedAt;
  if (age < 0) {
    return { kind: 'not_checked', floor: state.floor, reason: 'last demonstration is in the future; the clock is unusable' };
  }
  if (age < cfg.staleAfterMs) {
    return { kind: 'holds', floor: state.floor, reason: `last demonstrated ${age}ms ago, inside the ${cfg.staleAfterMs}ms window` };
  }

  // INVARIANT 2: step by tier. INVARIANT 3 again: never below what is currently
  // demonstrated — a stale floor still does not license contradicting a live
  // score.
  let target = state.floor;
  for (let i = 0; i < cfg.maxStepsPerEvaluation; i += 1) {
    const next = nextFloorBelow(target);
    if (next <= dbTierFloorFor(state.currentRepid)) {
      target = Math.max(next, dbTierFloorFor(state.currentRepid));
      break;
    }
    target = next;
  }
  if (target >= state.floor) {
    return { kind: 'holds', floor: state.floor, reason: 'no lower floor is available above the demonstrated level' };
  }
  return {
    kind: 'decays',
    from: state.floor,
    to: target,
    reason:
      `last demonstrated ${age}ms ago, beyond the ${cfg.staleAfterMs}ms window; stepping the FLOOR ` +
      'down one tier. The score is unchanged — this only stops protecting a claim the agent is ' +
      'no longer supporting.',
  };
}
