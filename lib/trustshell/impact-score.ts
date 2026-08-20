// lib/trustshell/impact-score.ts
//
// Suite I (docs/policy/phase2-e2e-predicates.md) — the impact index, computed
// exactly from the locked parameters in docs/policy/authority-policy.v0.5.yaml's
// `impact:` section. Zero imports: pure function of its inputs, same reason as
// `lane-files.ts` and `promotion.ts` — a decision that ends up in a status
// table must be runnable standalone.
//
// ── delta_0 IS A REQUIRED PARAMETER, NEVER DEFAULTED ────────────────────────
//
// `δ_imp = round(δ_0 · (0.4 + 1.6 · I))` names δ_0 symbolically everywhere it
// appears — `authority-policy.v0.5.yaml`'s `impact:` block, and
// `phase2-e2e-predicates.md`'s Suite I table. Neither states its numeric
// source. `docs/contracts/events.v1.json`'s `IMPACT_REWARD.metadata` carries
// `base_value` and `severity_multiplier` as tracked, non-applied provenance
// fields, which is suggestive but not a stated formula — is δ_0 `base_value`
// alone, `base_value * severity_multiplier`, or a fixed per-type constant
// nowhere written down? Checked and genuinely not found. Per this repo's own
// standing rule ("no numeric fallbacks ever — a default = second copy of
// policy = silent drift", `lib/trustshell/authority-policy.ts`), this module
// takes `delta0` as a required input rather than guessing. The caller supplies
// it; this file only applies the locked multiplier curve to whatever value
// arrives.
//
// ── I1's "unproven ⇒ 0" IS AN OVERRIDE, NOT THE FORMULA'S NATURAL FLOOR ─────
//
// The general formula's minimum, at I=0, is `round(0.4 · δ_0)` — a nonzero
// "participation floor" for any positive δ_0. But I1 states unproven
// (`iota_proof = 0`) ⇒ δ_imp = 0 OUTRIGHT, not the 0.4-floor value. That is
// the same shape as the referral curve's M4 (`unproven ⇒ δ = 0`, overriding
// the curve rather than falling out of it) — an explicit override, checked
// first, below, not left to fall out of the general formula by accident.

export type IotaSeverity = 'S0' | 'S1' | 'S2' | 'S3' | 'S4';
export type IotaWho = 'self_only' | 'other_agents' | 'people_ops' | 'ecosystem';
export type IotaProof = 'none' | 'artifact_ref' | 'verified_bounty_or_contracted';

/** The seven contribution types this curve applies to (authority-policy.v0.5.yaml `impact.types`). */
export type ImpactContributionType =
  | 'AUDIT_CONTRIBUTION'
  | 'CODE_CONTRIBUTION'
  | 'WORKFLOW_CONTRIBUTION'
  | 'TOOL_PIONEER'
  | 'AGENT_TEACHING'
  | 'HANDOFF_COSIGN_VERIFIED'
  | 'PEACEMAKER';

const IOTA_SEV: Readonly<Record<IotaSeverity, number>> = Object.freeze({ S0: 0.15, S1: 0.35, S2: 0.6, S3: 0.85, S4: 1.0 });
const IOTA_WHO: Readonly<Record<IotaWho, number>> = Object.freeze({ self_only: 0.4, other_agents: 0.8, people_ops: 1.0, ecosystem: 1.15 });
const IOTA_PROOF: Readonly<Record<IotaProof, number>> = Object.freeze({ none: 0, artifact_ref: 0.7, verified_bounty_or_contracted: 1.0 });

/** Global clamp per the locked policy: [-10, +5], widened to [-10, +8] only for the bounty exception. */
export const GLOBAL_CLAMP_MIN = -10;
export const GLOBAL_CLAMP_MAX = 5;
export const BOUNTY_CLAMP_MAX = 8;
export const BOUNTY_THRESHOLD_I = 0.85;

/** I6: impact never lands on axis S — it lands on E. Exposed as a constant so a caller cannot mis-wire it. */
export const IMPACT_LANDS_ON_AXIS = 'E';

export interface ImpactInputs {
  readonly severity: IotaSeverity;
  readonly who: IotaWho;
  readonly proof: IotaProof;
  readonly type: ImpactContributionType;
  /** REQUIRED. See the file header — never defaulted, never invented. */
  readonly delta0: number;
}

export interface ImpactResult {
  /** clip_[0,1](rawI) — the value actually used and stored. */
  readonly I: number;
  /** Pre-clip product ι_sev·ι_who·ι_proof — I5 checks THIS can exceed 1 while `I` cannot. */
  readonly rawI: number;
  /** True when iota_proof = 0 (proof: 'none') — the I1 override path. */
  readonly unproven: boolean;
  /** round(δ_0·(0.4+1.6·I)), BEFORE the clamp — I2 checks this directly. */
  readonly deltaImpRaw: number;
  /** After the clamp (and the bounty exception, and the unproven override). */
  readonly deltaImp: number;
  readonly clampMin: number;
  readonly clampMax: number;
  /** True when the AUDIT_CONTRIBUTION + I>=0.85 exception widened clampMax to +8. */
  readonly bountyExceptionApplied: boolean;
  /** I6, restated on every result: always 'E', never 'S'. */
  readonly landsOnAxis: 'E';
}

export function computeImpact(input: ImpactInputs): ImpactResult {
  const sev = IOTA_SEV[input.severity];
  const who = IOTA_WHO[input.who];
  const proofValue = IOTA_PROOF[input.proof];

  const rawI = sev * who * proofValue; // I5: this alone may exceed 1 (e.g. ecosystem=1.15)
  const I = Math.max(0, Math.min(1, rawI)); // clip_[0,1] — the value actually stored

  const bountyEligible = input.type === 'AUDIT_CONTRIBUTION' && I >= BOUNTY_THRESHOLD_I;
  const clampMin = GLOBAL_CLAMP_MIN;
  const clampMax = bountyEligible ? BOUNTY_CLAMP_MAX : GLOBAL_CLAMP_MAX;

  if (input.proof === 'none') {
    // I1 override: unproven zeroes the delta outright, not via the formula's
    // I=0 floor. deltaImpRaw is reported as 0 too, matching "I=0 => delta_imp=0"
    // literally, not the (nonzero, for delta0>0) general-formula floor.
    return {
      I, rawI, unproven: true, deltaImpRaw: 0, deltaImp: 0, clampMin, clampMax,
      bountyExceptionApplied: false, landsOnAxis: IMPACT_LANDS_ON_AXIS,
    };
  }

  const deltaImpRaw = Math.round(input.delta0 * (0.4 + 1.6 * I)); // I2, evaluated at I=1 gives round(2*delta0)
  const deltaImp = Math.max(clampMin, Math.min(clampMax, deltaImpRaw));

  return {
    I, rawI, unproven: false, deltaImpRaw, deltaImp, clampMin, clampMax,
    bountyExceptionApplied: bountyEligible, landsOnAxis: IMPACT_LANDS_ON_AXIS,
  };
}
