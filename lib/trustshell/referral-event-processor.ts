// lib/trustshell/referral-event-processor.ts
//
// Suite R, undecidable mutants M4-M8 (docs/policy/phase2-e2e-predicates.md).
// `lane-files.ts`'s own header explains why M4-M8 were never in its count:
// they are "policy conditions on inputs this file cannot see" (evidence.ref,
// referee lifecycle_status, family/self relationship, axis routing) —
// undecidable from a zero-imports formula file, by design. This module is
// that missing input layer: a real referral-EVENT processor that resolves
// those conditions from `repid_agents`' actual schema and feeds the already-
// locked curve (`lane-files.ts`'s `referralDelta`) exactly once per
// qualifying referral.
//
// ── WHY THIS IMPORTS lane-files.ts, WHEN THAT FILE SAYS ZERO IMPORTS ───────
//
// Same reasoning as `decay-dryrun.ts` importing `repid-floor-decay.ts` and
// `pay-auth.ts` importing `receipt-audit.ts`: `lane-files.ts` needs nothing
// else, but `referralDelta(n)` is the ALREADY-LOCKED, ALREADY-VERIFIED curve
// (`check:lane-files`, 32/32, worked values n=1→12…n=100→0) — re-deriving
// `clip(round(40/(n+1)), 0, c(n))` a second time here would be exactly the
// kind of duplicate-formula drift this repo's culture keeps catching. Both
// files stay Supabase-free, so the pair still compiles fully standalone.
//
// ── WHAT "SAME-FAMILY" MEANS HERE, AND WHY IT IS NOT verifier-independence.ts's ──
//
// `verifier-independence.ts`'s `Attribution.family` means LLM TRAINING
// LINEAGE ('claude' | 'gpt' | …) — the right concept for judging whether a
// grader is independent of an author. M6's "same-family or self" for a
// REFERRAL is a different question — Sybil/farming detection: does the same
// OPERATOR control both the referrer and referee agents? Reusing the model-
// family concept here would be a category error, not honest reuse, so this
// module does not import it. `repid_agents` has real columns for the
// question that IS being asked: `builder_id` (uuid — the same key
// `CollateralRepository.forBuilder` already uses as the one real FK this
// codebase has for "who operates this agent") and `squad_id` (uuid — a
// declared agent grouping). Two agents sharing either counts as same-family.
// `self` is the trivial case: same `repid_agents.id`.
//
// ── WHY refereeLifecycleStatus IS repid_agents.lifecycle_status, NOT agent_kya_registry.lifecycle_state ──
//
// Two different tables, two differently-named lifecycle columns, confirmed
// live against `information_schema.columns`: `repid_agents.lifecycle_status`
// (text) vs `agent_kya_registry.lifecycle_state` (text). `decay-dryrun.ts`'s
// D2 already reads the `repid_agents` one; `repid-floor-decay.ts`'s header
// also cites `lifecycle_status='test_only'` on `repid_agents`-shaped rows.
// This module follows the same source rather than the similarly-named but
// different column on the KYA table — checked, not assumed, the same
// discipline that caught `last_active_at`'s trap in the previous commit.
//
// ── STATUS: A REAL PROCESSOR, HONESTLY UNWIRED ──────────────────────────────
//
// `repid_score_events` holds ZERO `ECOSYSTEM_REFERRAL` rows (measured live
// this session), so there is no real event stream to run this against yet.
// Same shadow posture as `x402-settlement-rules.ts`: shaped to the real
// schema, not claimed to have a caller.

import { referralDelta } from './lane-files';

export interface ReferralAgentIdentity {
  /** repid_agents.id (uuid). */
  readonly id: string;
  /** repid_agents.builder_id (uuid), or null if unset. */
  readonly builderId: string | null;
  /** repid_agents.squad_id (uuid), or null if unset. */
  readonly squadId: string | null;
}

/** The three qualify_or signals from authority-policy.v0.5.yaml's referral.qualify_or. At least one required. */
export type ReferralQualificationSignal =
  | 'referred_R_ge_500'
  | 'referred_nonsim_x402_ge_1'
  | 'referred_quorum_hal_ge_1';

export interface ReferralEvent {
  readonly referrer: ReferralAgentIdentity;
  readonly referee: ReferralAgentIdentity;
  /** repid_agents.lifecycle_status for the REFEREE. 'test_only' fails M5. */
  readonly refereeLifecycleStatus: string;
  /** Whether evidence.ref was supplied for this referral. false fails M4. */
  readonly evidenceRefPresent: boolean;
  /** Which qualify_or signals this referee satisfies. Empty fails to qualify. */
  readonly qualificationSignals: readonly ReferralQualificationSignal[];
}

export type ReferralDisqualifyReason =
  | 'self'
  | 'same_family'
  | 'test_only'
  | 'unproven'
  | 'no_qualifying_signal';

export interface ReferralOutcome {
  /** Did this referral increment the referrer's qualified count n? */
  readonly counts: boolean;
  /** The rank this referral occupied, if it counted; null otherwise. */
  readonly n: number | null;
  /** The applied delta — 0 for every disqualified path, referralDelta(n) otherwise. */
  readonly delta: number;
  /** M8: always Q. Never S. A constant, not a computed choice. */
  readonly landsOnAxis: 'Q';
  /** Set only when `counts` is false. */
  readonly disqualifyReason: ReferralDisqualifyReason | null;
  readonly detail: string;
}

/** M8, restated as an importable fact rather than a string a caller could typo. */
export const REFERRAL_LANDS_ON_AXIS = 'Q';

/**
 * M7: the global HAL clamp (+5) and the referral type-clamp c(n) are
 * different ceilings on different mechanisms. Exposed as a constant, and
 * asserted against `lane-files.ts`'s own `referralClamp` in the check
 * script, rather than merely stated in a comment.
 */
export const GLOBAL_HAL_CLAMP = 5;

/**
 * Processes one referrer's referral events IN ORDER, resolving M4-M6 per
 * event and feeding every qualifying one through the already-locked curve.
 * `n` only increments on a qualifying referral — `rank_n: qualified_count_only`
 * in authority-policy.v0.5.yaml, and M5's own text ("does not increment").
 */
export function processReferralSequence(events: readonly ReferralEvent[]): readonly ReferralOutcome[] {
  let n = 0;
  const outcomes: ReferralOutcome[] = [];

  for (const event of events) {
    if (event.referrer.id === event.referee.id) {
      outcomes.push(disqualified('self', 'referrer.id === referee.id'));
      continue;
    }

    const sameBuilder = event.referrer.builderId !== null && event.referrer.builderId === event.referee.builderId;
    const sameSquad = event.referrer.squadId !== null && event.referrer.squadId === event.referee.squadId;
    if (sameBuilder || sameSquad) {
      outcomes.push(
        disqualified('same_family', sameBuilder ? 'shared builder_id' : 'shared squad_id')
      );
      continue;
    }

    // M5: test_only referee -- does not increment n, delta=0.
    if (event.refereeLifecycleStatus === 'test_only') {
      outcomes.push(disqualified('test_only', 'referee.lifecycle_status === "test_only"'));
      continue;
    }

    // M4: unproven -- no evidence.ref, delta=0 even if this would have been n=1.
    if (!event.evidenceRefPresent) {
      outcomes.push(disqualified('unproven', 'evidence.ref absent'));
      continue;
    }

    if (event.qualificationSignals.length === 0) {
      outcomes.push(
        disqualified('no_qualifying_signal', 'none of referred_R_ge_500 / referred_nonsim_x402_ge_1 / referred_quorum_hal_ge_1 present')
      );
      continue;
    }

    n += 1;
    outcomes.push({
      counts: true,
      n,
      delta: referralDelta(n), // the ALREADY-LOCKED curve, not re-derived
      landsOnAxis: REFERRAL_LANDS_ON_AXIS,
      disqualifyReason: null,
      detail: `qualified referral #${n}, signals: ${event.qualificationSignals.join(', ')}`,
    });
  }

  return outcomes;
}

function disqualified(reason: ReferralDisqualifyReason, detail: string): ReferralOutcome {
  return { counts: false, n: null, delta: 0, landsOnAxis: REFERRAL_LANDS_ON_AXIS, disqualifyReason: reason, detail };
}
