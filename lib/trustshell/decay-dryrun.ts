// lib/trustshell/decay-dryrun.ts
//
// Suite D (docs/policy/phase2-e2e-predicates.md) — a pure DRY-RUN producer for
// the soft-landing decay envelope locked in docs/policy/authority-policy.v0.5.yaml's
// `decay:` section. Computes what decay WOULD do; writes nothing, matching that
// file's own `write: dry_run_default: true`.
//
// "Suite D fails closed if a dry-run cannot produce W for agents that have
// last_active_at: that is NOT_CHECKED, not a pass." — this file's every skip
// path returns 'skip' or 'not_checked', never a fabricated number standing in
// for one it could not compute.
//
// ── WHY THIS IMPORTS repid-floor-decay.ts, WHEN THAT FILE SAYS ZERO IMPORTS ──
//
// `repid-floor-decay.ts` has zero imports because IT needs nothing else. This
// file imports ONE thing from it — `dbTierFloorFor` — because F_tier in
// `R_dec = max(R·(1-r)^W, F_tier)` needs a tier-floor table, and that file
// already has one, ALREADY measured against production (`repid-floor-decay.ts`
// header: "VERIFIED 2026-08-17 against pg_get_functiondef"). Re-deriving a
// second copy here would be exactly the "two tier ladders alive at once"
// hazard that file's own header warns about — it names TWO real ladders in
// this codebase (the database's 8000/5000/1000/500/0 vs `repid-scoring.ts`'s
// Platinum/Gold/Silver/Bronze 7500/5000/2500/0) and says using the wrong one
// is "the live hazard". `dbTierFloorFor` IS the database ladder, which is the
// one `authority-policy.v0.5.yaml`'s locked policy is written against
// (PROBATIONARY/EARNING/ESTABLISHED/AUTONOMOUS/VETERAN at 0/500/1000/5000/8000
// — the canonical scheme). Neither file imports Supabase or the `@/` alias, so
// the pair still compiles fully standalone; it just needs two files in the
// tsconfig instead of one, the same way `pay-auth.ts` imports from
// `receipt-audit.ts`.
//
// ── WHY THE FIELD IS `lastObservedAt`, NOT `repid_agents.last_active_at` ────
//
// D1's own predicate text names its input "`last_active_at`" — the CONCEPT of
// when an agent was last active, not a specific column. Reading it as the
// literal `repid_agents.last_active_at` column would repeat a trap this
// codebase already measured and gates on: `check:observation-identity`
// (`scripts/check-observation-identity.mjs`) FAILS any code that keys
// recency off that column, because it is written by exactly one narrow
// database function (`apply_linked_bet_resolution`), by zero lines of this
// repo, is NULL on 11 of the 12 ratcheted rows, and understates 30-day
// activity roughly four-fold fleet-wide — "fails in the expensive
// direction", per that check's own header, because a rule keyed on it
// expires standing for agents that are demonstrably active. The admissible
// source, per the same file, is `v_agent_earned_observations.observed_at`
// (joined on `repid_agents.id`, the uuid key — see `EarnedMetricsRepo.ts`
// and `check:observation-identity`'s own reasoning on why `agent_id`, the
// disjoint text column, is the wrong key too). So `DecayAgentState`'s field
// is named — and must be sourced — for that view's column, not the
// tempting, textually-matching, and wrong one.
//
// ── WHAT IS DIRECTLY SPECIFIED VS WHAT IS THE NARROWEST REASONABLE READING ──
//
// D1–D9, D11 and the two named fixtures (F-DECAY-SIM, F-DECAY-SETTLE-SPLIT)
// are computed EXACTLY from the locked formulas — nothing invented. Two
// specific gaps in the locked docs are called out explicitly rather than
// silently filled:
//
//   `m` (the "decaying-decay eases m ∈ [0.25, 1]" term in `r = ρ · m`) has no
//   stated formula anywhere in `authority-policy.v0.5.yaml` or
//   `phase2-e2e-predicates.md` — only that it exists and is bounded. This
//   module does NOT invent one. It reads the agent's own stored `decay_rate`
//   column directly as `r` (the already-combined per-week rate), matching D3's
//   own framing ("`decay_rate` NULL ⇒ skip") — `decay_rate` is read, not
//   derived, the same way `lastObservedAt` is read (from the admissible
//   view, not derived from anything). If `ρ · m` is ever computed separately
//   from a stored `decay_rate`, this function's `state.decayRate` input is
//   exactly the seam to feed that in — no code here needs to change.
//
//   The intra-settle σ value during a >50-point SPLIT settle (two ticks) is
//   not stated — the doc gives both settle-magnitude ENDPOINTS (one tick:
//   R_route jumps straight to R_ledger, σ→0; two ticks: same endpoint,
//   reached over two equal steps) but not σ's value between the two settle
//   sub-ticks. `decayEnvelopeTicks` below reports σ=1 on the first of two
//   settle sub-ticks (the envelope has not yet fully closed) and σ=0 only
//   after the last — stated here as the chosen, narrowest reading, not as
//   locked policy. None of D1–D14 or the two named fixtures actually depend
//   on that specific intermediate value; they test tick COUNT (1 vs 2) and
//   magnitude (settleMagnitude vs two equal halves) and the FINAL state
//   (D11), all of which ARE directly specified.
//
// ── WHY A_eff IS NOT COMPUTED HERE ───────────────────────────────────────────
//
// `authority-policy.ts`'s `effectiveAuthority()` already exists, is already
// exercised live (item 1, this session), and its own `AuthorityInputs.rRoute`
// field is already named and commented for exactly this purpose: "ROUTING
// RepID, never the ledger value, while the decay envelope is open. Using
// r_ledger here makes A_eff rise because decay was latent — the policy names
// that as an invariant violation." D10 and D13 are PROVEN by calling that
// real function with this module's `rRoute` output, not by a second A_eff
// formula living here that could drift from the first.

import { dbTierFloorFor } from './repid-floor-decay';

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/** λ_σ, locked. The soft-landing envelope only "feels" half of Δ_full while open. */
export const LAMBDA_SIGMA = 0.5;

/** RepID points. Above this, a settle is split into two equal ticks. */
export const SETTLE_SPLIT_THRESHOLD_POINTS = 50;

export interface DecayAgentState {
  /**
   * ms epoch, or null. NULL ⇒ skip (D1) — never invented. MUST be sourced
   * from `v_agent_earned_observations.observed_at` (joined on
   * `repid_agents.id`) — NEVER from `repid_agents.last_active_at`, which
   * `check:observation-identity` already measured to be unreliable (NULL on
   * 11 of 12 ratcheted rows). See this file's header.
   */
  readonly lastObservedAt: number | null;
  /** Must equal 'active' to proceed (D2). */
  readonly lifecycleStatus: string;
  /** r, the per-week rate, read directly from the agent row. NULL ⇒ skip (D3). */
  readonly decayRate: number | null;
  /** R_pre — the score before this dry-run. */
  readonly currentRepid: number;
}

export type DecayDryRunResult =
  | { readonly kind: 'skip'; readonly reason: string }
  | { readonly kind: 'not_checked'; readonly reason: string }
  | {
      readonly kind: 'decay';
      /** W, idle weeks — MEASURED, not assumed. */
      readonly W: number;
      /** K = min(8, max(1, ceil(W))) — D4. */
      readonly K: number;
      /** Δ_full = R_pre - R_dec, rounded to an integer (ledger-applied deltas are ℤ). */
      readonly deltaFull: number;
      /** K integers summing to deltaFull, remainder on the last tick — D5, D6. */
      readonly deltaTicks: readonly number[];
      /** R_dec = max(R_pre·(1-r)^W, F_tier) — the fully-settled ledger value. */
      readonly rDec: number;
      /** F_tier used, from the DATABASE ladder (dbTierFloorFor), not repid-scoring.ts's. */
      readonly fTier: number;
    };

/**
 * D1–D6: does decay apply at all, and if so, what are W/K/Δ_full/the per-tick
 * integer split? Pure; produces a result, never writes.
 */
export function dryRunDecay(state: DecayAgentState, now: number): DecayDryRunResult {
  if (state.lastObservedAt === null) {
    return { kind: 'skip', reason: 'last-observed timestamp is NULL (D1) — never invent one' };
  }
  if (state.lifecycleStatus !== 'active') {
    return { kind: 'skip', reason: `lifecycle is "${state.lifecycleStatus}", not "active" (D2)` };
  }
  if (state.decayRate === null) {
    return { kind: 'skip', reason: 'decay_rate is NULL (D3)' };
  }
  if (!Number.isFinite(state.currentRepid)) {
    return { kind: 'not_checked', reason: 'current_repid is not a finite number' };
  }
  if (!Number.isFinite(state.decayRate) || state.decayRate < 0 || state.decayRate >= 1) {
    return { kind: 'not_checked', reason: `decay_rate ${state.decayRate} is out of the valid [0,1) range for (1-r)^W` };
  }
  if (now < state.lastObservedAt) {
    return { kind: 'not_checked', reason: 'last-observed timestamp is in the future; the clock is unusable' };
  }

  const W = (now - state.lastObservedAt) / MS_PER_WEEK;
  const K = Math.min(8, Math.max(1, Math.ceil(W))); // D4

  const r = state.decayRate;
  const rDecRaw = state.currentRepid * Math.pow(1 - r, W);
  const fTier = dbTierFloorFor(state.currentRepid); // F_tier from R_pre's OWN tier, DB ladder
  const rDec = Math.max(rDecRaw, fTier);

  // Integer-delta rule (docs/policy/integer-delta-rule.v1.md): ledger-applied
  // deltas are ℤ. Δ_full is always >= 0 here (both rDecRaw and fTier are <=
  // currentRepid by construction), so plain Math.round matches
  // "half_away_from_zero" — they diverge only for negative inputs.
  const deltaFull = Math.round(state.currentRepid - rDec);

  // D5, D6: K integers summing exactly to deltaFull, remainder on the LAST tick.
  const base = Math.trunc(deltaFull / K);
  const deltaTicks: number[] = Array.from({ length: K }, (_, i) =>
    i < K - 1 ? base : deltaFull - base * (K - 1)
  );

  return { kind: 'decay', W, K, deltaFull, deltaTicks, rDec, fTier };
}

export interface DecayEnvelopeTick {
  /** 1-indexed. Ticks 1..K are the decay ticks; settle ticks continue the count. */
  readonly k: number;
  readonly sigma: 0 | 1;
  /** R_pre - Σ_{j<=k} Δ_j while inside 1..K; R_dec at and after full settle. */
  readonly rLedger: number;
  /** R_pre - λ_σ · Σ_{j<=k} Δ_j while σ=1; equals rLedger once σ=0 (D11). */
  readonly rRoute: number;
  readonly isSettleTick: boolean;
}

export interface SettleShape {
  readonly magnitude: number; // (1-λ_σ)·Δ_full
  readonly numTicks: 1 | 2;
  readonly perTick: number;
}

/** The settle-tick shape alone — split_if_magnitude_gt_50, exercised directly against F-DECAY-SIM / F-DECAY-SETTLE-SPLIT. */
export function settleShapeFor(deltaFull: number): SettleShape {
  const magnitude = (1 - LAMBDA_SIGMA) * deltaFull;
  const numTicks: 1 | 2 = magnitude > SETTLE_SPLIT_THRESHOLD_POINTS ? 2 : 1;
  return { magnitude, numTicks, perTick: magnitude / numTicks };
}

/**
 * D7–D9, D11: the full σ/R_route/R_ledger tick sequence, decay ticks then
 * settle tick(s). `rPre` is passed separately from `decay.deltaTicks` etc. so
 * a caller cannot accidentally reuse a stale `currentRepid` from a different
 * dry-run call.
 */
export function decayEnvelopeTicks(
  decay: Extract<DecayDryRunResult, { kind: 'decay' }>,
  rPre: number
): readonly DecayEnvelopeTick[] {
  const ticks: DecayEnvelopeTick[] = [];
  let cumulativeDelta = 0;
  for (let k = 1; k <= decay.K; k += 1) {
    cumulativeDelta += decay.deltaTicks[k - 1] ?? 0;
    const rLedger = rPre - cumulativeDelta;
    const rRoute = rPre - LAMBDA_SIGMA * cumulativeDelta; // D7
    ticks.push({ k, sigma: 1, rLedger, rRoute, isSettleTick: false });
  }

  const settle = settleShapeFor(decay.deltaFull);
  const finalRLedger = rPre - decay.deltaFull; // == decay.rDec
  let rRouteAtSettleStart = ticks.length > 0 ? ticks[ticks.length - 1].rRoute : rPre;
  for (let s = 1; s <= settle.numTicks; s += 1) {
    const isLast = s === settle.numTicks;
    rRouteAtSettleStart -= settle.perTick;
    ticks.push({
      k: decay.K + s,
      // D11: after settle tick, R_route = R_ledger and sigma = 0. Only the
      // LAST settle sub-tick is directly specified to reach that state; see
      // the file header for why the intermediate value on a 2-tick settle is
      // this module's chosen reading, not locked policy.
      sigma: isLast ? 0 : 1,
      rLedger: finalRLedger,
      rRoute: isLast ? finalRLedger : rRouteAtSettleStart,
      isSettleTick: true,
    });
  }

  return ticks;
}
