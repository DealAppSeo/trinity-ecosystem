// lib/trustshell/authority-policy.ts
//
// The first runtime consumer of `docs/policy/authority-policy.v0.5.yaml`.
//
// ZERO IMPORTS. Takes the already-parsed policy document as a value, so it runs
// standalone and stays in the portable surface; one adapter reads the file.
//
// ── WHY THIS EXISTS: THE SOFT-LIVE → LIVE PATH ──────────────────────────────
//
// `check:lane-files` grades the policy file as **soft-live**: gated and passing,
// but the gate does not cover the whole claim. That ceiling is not a defect in
// the file and XC cannot lift it by editing — it is soft-live because **nothing
// in the runtime consumes it**. `effectiveAuthority` and `authorityPolicy` were
// measured ABSENT from `lib/` and `app/` on 2026-08-19.
//
// A policy nothing reads is a document. This module is the smallest thing that
// makes it a policy: it reads the constants from the document and computes
// `A_eff` from them.
//
// ── THE RULE THAT MAKES IT WORTH ANYTHING ───────────────────────────────────
//
// **No constant in this file has a default.** Every value comes from the
// document, and a missing field returns NOT_CHECKED rather than a fallback.
//
// That is deliberate and it is the whole point. A default here would be a second
// copy of the policy — and the moment the YAML changed, the runtime would keep
// using the copy while every gate went on grading the file. The system would
// report agreement it had not earned, which is this repo's defining defect
// wearing a config loader. `RepIDConfig` already produced exactly that shape
// once: an unreadable institution threshold silently became 5000, which LOWERS
// the bar for an institution that stored a stricter number.
//
// So: no `?? 500`, no `|| 0.5`. Absent means unknown, and unknown does not spend.

/** The subset of the policy this consumer needs, extracted and validated. */
export interface AuthorityPolicy {
  version: string;
  /** `authority.builder_floor` — below this, A_eff is zero. */
  builderFloor: number;
  /** `decay.lambda_sigma` — how much of an applied decay routing sees while σ=1. */
  lambdaSigma: number;
  /** `composite.weights`, five axes summing to 1. */
  weights: { S: number; P: number; H: number; Q: number; E: number };
  /** The anti-whale multiplier in `100 * sqrt(S_usd)`. Read, not assumed. */
  antiWhaleMultiplier: number;
}

export type PolicyLoad =
  | { ok: true; policy: AuthorityPolicy }
  | { ok: false; missing: string[]; detail: string };

/**
 * Extract what the runtime needs, or say precisely what is missing.
 *
 * The anti-whale multiplier is parsed out of the formula string
 * `min(R, 100 * sqrt(S_usd))` rather than hardcoded as 100. If XC retunes it,
 * the runtime follows; if the formula stops being parseable, this reports that
 * instead of quietly keeping the old number.
 */
export function loadAuthorityPolicy(doc: unknown): PolicyLoad {
  const missing: string[] = [];
  const d = (doc ?? {}) as Record<string, any>;

  const version = d.meta?.version;
  if (typeof version !== 'string') missing.push('meta.version');

  const builderFloor = d.authority?.builder_floor;
  if (typeof builderFloor !== 'number') missing.push('authority.builder_floor');

  const lambdaSigma = d.decay?.lambda_sigma;
  if (typeof lambdaSigma !== 'number') missing.push('decay.lambda_sigma');

  const w = d.composite?.weights ?? {};
  for (const axis of ['S', 'P', 'H', 'Q', 'E']) {
    if (typeof w[axis] !== 'number') missing.push(`composite.weights.${axis}`);
  }

  // `A: "min(R, 100 * sqrt(S_usd))"` — take the multiplier from the formula.
  const formula = String(d.authority?.A ?? '');
  const m = formula.match(/(\d+(?:\.\d+)?)\s*\*\s*sqrt\(/);
  const antiWhaleMultiplier = m ? Number(m[1]) : NaN;
  if (!Number.isFinite(antiWhaleMultiplier)) missing.push('authority.A (multiplier on sqrt)');

  if (missing.length > 0) {
    return {
      ok: false,
      missing,
      detail:
        `authority policy is missing ${missing.length} field(s): ${missing.join(', ')}. ` +
        'No default is substituted — a default here is a second copy of the policy, and the ' +
        'runtime would drift from the file while every gate kept grading the file.',
    };
  }

  return {
    ok: true,
    policy: {
      version: version as string,
      builderFloor: builderFloor as number,
      lambdaSigma: lambdaSigma as number,
      weights: { S: w.S, P: w.P, H: w.H, Q: w.Q, E: w.E },
      antiWhaleMultiplier,
    },
  };
}

/** Do the five axis weights actually sum to 1? A composite is otherwise not a mean. */
export function weightsSumToOne(p: AuthorityPolicy, tolerance = 1e-9): boolean {
  const { S, P, H, Q, E } = p.weights;
  return Math.abs(S + P + H + Q + E - 1) <= tolerance;
}

export type AuthorityOutcome = 'MEASURED' | 'NOT_CHECKED';

export interface EffectiveAuthority {
  /** Dollars an agent may move. Null when it could not be computed. */
  aEff: number | null;
  outcome: AuthorityOutcome;
  /** Which term actually bound the result — a denial you cannot explain is not actionable. */
  bindingTerm: 'r_route' | 'anti_whale_sqrt_stake' | 'builder_floor' | null;
  detail: string;
}

export interface AuthorityInputs {
  /**
   * ROUTING RepID, never the ledger value, while the decay envelope is open.
   * Using r_ledger here makes A_eff rise because decay was latent — the policy
   * names that as an invariant violation.
   */
  rRoute: number;
  /** REAL collateral only. See `collateral.ts`: the table is 51/52 simulated. */
  stakeUsd: number | null;
  builderScore: number;
}

/**
 * `A_eff = min(R_route, M * sqrt(S_usd)) * 1[builder >= floor]`.
 *
 * Every constant comes from the policy argument. Null collateral yields
 * NOT_CHECKED rather than zero: unknown backing is not the same as no backing,
 * and the two must not resolve to the same spending decision by accident.
 */
export function effectiveAuthority(
  input: AuthorityInputs,
  policy: AuthorityPolicy
): EffectiveAuthority {
  if (input.stakeUsd === null) {
    return {
      aEff: null,
      outcome: 'NOT_CHECKED',
      bindingTerm: null,
      detail: 'collateral could not be measured — unknown backing is not zero backing',
    };
  }

  if (input.builderScore < policy.builderFloor) {
    return {
      aEff: 0,
      outcome: 'MEASURED',
      bindingTerm: 'builder_floor',
      detail: `builder ${input.builderScore} is below the floor of ${policy.builderFloor}`,
    };
  }

  const antiWhale = policy.antiWhaleMultiplier * Math.sqrt(input.stakeUsd);
  const bound = Math.min(input.rRoute, antiWhale);

  return {
    aEff: bound,
    outcome: 'MEASURED',
    bindingTerm: bound === antiWhale && antiWhale < input.rRoute ? 'anti_whale_sqrt_stake' : 'r_route',
    detail:
      `min(r_route ${input.rRoute}, ${policy.antiWhaleMultiplier} * sqrt(${input.stakeUsd}) = ` +
      `${antiWhale.toFixed(2)}) = ${bound.toFixed(2)}`,
  };
}
