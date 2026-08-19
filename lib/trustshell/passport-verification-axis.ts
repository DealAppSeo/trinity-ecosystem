// lib/trustshell/passport-verification-axis.ts
//
// Suite P (docs/policy/phase2-e2e-predicates.md) — renders the passport's
// `verification_axis` fields from Suite D's real decay-dryrun output
// (`lib/trustshell/decay-dryrun.ts`). Matches the shape already locked in
// `docs/contracts/events.v1.json`'s `ZKPPassportDisclosure.verification_axis`
// (`soft_landing_active: boolean`, `amortization_progress: string | null`
// matching `^[0-9]+ of [0-9]+$`) — this file does not invent a new schema,
// it fills the one that already exists.
//
// ZERO new imports beyond decay-dryrun.ts's own TYPES (type-only import,
// erased at compile time — this file still needs nothing at runtime beyond
// its one argument).

import type { DecayDryRunResult, DecayEnvelopeTick } from './decay-dryrun';

export interface VerificationAxis {
  readonly soft_landing_active: boolean;
  readonly amortization_progress: string | null;
}

/**
 * P4: `soft_landing_active` is on every return path, unconditionally — the
 * field is non-optional on `VerificationAxis`, so "missing field" is
 * unreachable from this function's return TYPE, not merely tested at
 * runtime. P5: the returned shape has exactly these two keys — there is no
 * `enforced`/`decayEnforced` field anywhere on it, so this API cannot
 * express "decay is enforced" even by accident; `soft_landing_active: true`
 * can only ever mean the envelope is open (sigma=1), never that a write
 * happened — decay-dryrun.ts writes nothing, by construction.
 */
export function renderVerificationAxis(
  decay: DecayDryRunResult,
  currentTick?: DecayEnvelopeTick
): VerificationAxis {
  // P3: skip (D1-D3) or not_checked => soft_landing_active = false. Not
  // invented as "unknown" or "true" — an agent decay never touched is not
  // in a soft-landing envelope, which is the correct, checkable false.
  if (decay.kind === 'skip' || decay.kind === 'not_checked') {
    return { soft_landing_active: false, amortization_progress: null };
  }

  // Decay applies, but no tick has been supplied (e.g. queried before any
  // tick was computed) — the envelope has not been observed open yet.
  if (!currentTick) {
    return { soft_landing_active: false, amortization_progress: null };
  }

  // P1: soft_landing_active <=> sigma=1, read directly from the real tick —
  // no second sigma computation here to drift from decay-dryrun.ts's own.
  const active = currentTick.sigma === 1;

  // P2 falls out of P1 rather than being a separate rule: the post-settle
  // tick decay-dryrun.ts produces already has sigma=0 (D11), so `active` is
  // false there without this function needing to know "that was the settle
  // tick" explicitly.
  return {
    soft_landing_active: active,
    amortization_progress: active ? `${Math.min(currentTick.k, decay.K)} of ${decay.K}` : null,
  };
}
