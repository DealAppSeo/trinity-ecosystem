// lib/trustshell/attestation-presence.ts
//
// Item B (2026-08-19): "GateRun must record attestation presence as
// MEASURED | NOT_CHECKED | FAILED." This is that record, and nothing else.
//
// ZERO IMPORTS. Same reasoning as promotion.ts / collateral.ts / lane-files.ts:
// a decision that ends up in a status table must be runnable standalone. It
// does NOT import collateral.ts or verifier-independence.ts — the two
// interfaces below are structural mirrors of `RealCollateral` and
// `IndependenceVerdict`, matched by shape rather than by dependency, exactly
// the way `promotion.ts` accepts an `attribution` without importing
// verifier-independence.ts. See docs/ERC8004-ZK-ATTESTATION-PROPOSAL-2026-08-19.md
// for the full research and the two proposed attestations this module reports
// on.
//
// WHAT THIS FILE DOES NOT DO. It does not call a chain — the Validation
// Registry this is designed to compose with has no confirmed live deployment
// on any public chain (see the proposal doc, §1). It does not sign anything —
// that is `lib/trustshell/identity/control-proof.ts`'s job, unchanged by this
// file. It does not gate the pay route or any promotion claim. It is a pure
// function pair: real inputs in, an honest three-outcome verdict out.
//
// WHY TWO FUNCTIONS, NOT ONE. The two attestations the instruction asked for
// are not the same kind of claim and must not share a verdict path:
//
//   collateral-eval  -- a claim about which PROCESS ran (was collateral real,
//                        was the evaluator independent). Not a secret; needs
//                        signing, not hiding. Buildable today.
//   soft-landing-range -- a claim that HIDES a witness (the exact axis score)
//                        while proving a predicate about it. Needs a real
//                        zero-knowledge prover. Blocked today, on both sides
//                        of the composition (this repo's own provider AND
//                        hyperdag-protocol's own circuit are non-production).
//
// Collapsing them into one "attestation" type would have hidden that only one
// of the two can honestly report MEASURED under any input today.

/**
 * Structural mirror of `lib/trustshell/collateral.ts`'s `CollateralOutcome`.
 * `NONE` is a confirmed negative (real collateral is genuinely zero), distinct
 * from `NOT_CHECKED` (could not be read) -- same distinction as the source.
 */
export type CollateralOutcomeLike = 'MEASURED' | 'NONE' | 'NOT_CHECKED';

/**
 * Structural mirror of `lib/trustshell/verifier-independence.ts`'s
 * `Independence`. `SHARED_FAMILY` is a confirmed negative (the verdict and
 * the work share a training lineage), distinct from `NOT_CHECKED`.
 */
export type IndependenceLike = 'DISJOINT' | 'SHARED_FAMILY' | 'NOT_CHECKED';

export type AttestationPresence = 'MEASURED' | 'NOT_CHECKED' | 'FAILED';

export interface AttestationPresenceVerdict {
  presence: AttestationPresence;
  /**
   * The namespaced tag this would carry into `validationResponse`'s free-form
   * `tag` field if/when a live Validation Registry address exists to submit
   * to (it does not today -- see the proposal doc §1). Fixed per attestation
   * kind, not computed from the verdict, so a reader can grep for it.
   */
  tag: string;
  detail: string;
}

/**
 * Attestation #2: "this reward/pay decision used real collateral + a
 * contracted (independent) evaluation."
 *
 * MEASURED requires BOTH inputs to be a genuine, computed positive. Either
 * input being NOT_CHECKED makes the whole claim NOT_CHECKED -- an unmeasured
 * half is not a half-true attestation, the same reasoning `stageFor` in
 * promotion.ts uses to refuse letting a passing run outvote a NOT_CHECKED
 * one. Only once both inputs are resolved does a confirmed negative on either
 * side become FAILED, rather than being silently absorbed into NOT_CHECKED.
 */
export function describeCollateralEvalAttestationPresence(
  collateral: { outcome: CollateralOutcomeLike },
  evaluation: { independence: IndependenceLike }
): AttestationPresenceVerdict {
  const tag = 'trustshell:collateral-eval:v1';

  if (collateral.outcome === 'NOT_CHECKED' || evaluation.independence === 'NOT_CHECKED') {
    return {
      presence: 'NOT_CHECKED',
      tag,
      detail:
        `collateral=${collateral.outcome}, independence=${evaluation.independence} -- ` +
        'at least one input is itself unmeasured, so the combined claim cannot be either',
    };
  }

  if (collateral.outcome === 'NONE' || evaluation.independence === 'SHARED_FAMILY') {
    return {
      presence: 'FAILED',
      tag,
      detail:
        `collateral=${collateral.outcome}, independence=${evaluation.independence} -- ` +
        'both inputs resolved, and at least one is a confirmed negative (no real collateral, ' +
        'or a same-family/self evaluator). A confirmed negative must report FAILED, never be ' +
        'absorbed into NOT_CHECKED -- that is exactly the x402PaymentProof mistake this ' +
        'attestation exists to not repeat (see proposal doc §2): a claim that cannot be false ' +
        'is not a claim.',
    };
  }

  return {
    presence: 'MEASURED',
    tag,
    detail:
      'collateral=MEASURED (real, active USDC) and independence=DISJOINT (disjoint training ' +
      'lineage) -- the only input combination this function reports MEASURED for',
  };
}

/**
 * Structural mirror of `lib/trustshell/identity/proof-provider.ts`'s
 * `ProofResult`, narrowed to the three fields this verdict needs.
 */
export interface ProofResultLike {
  /** Mirrored from the provider (see proof-provider.ts) -- false for every provider available today. */
  witnessHidden: boolean;
  /** True only when a prover actually ran. */
  proven: boolean;
  /** The predicate's truth value, when the provider could compute it. */
  predicateHolds: boolean;
}

/**
 * Attestation #1: a `soft_landing_active` / axis-range claim that hides the
 * underlying score.
 *
 * `witnessHidden=false` is NOT reported as FAILED. FAILED means "a real
 * hiding proof ran and the claimed range does not hold" -- a fact about the
 * agent. `witnessHidden=false` is a fact about the TOOLING (no available
 * provider can hide a witness today), and reporting it as FAILED would
 * misdescribe every agent as being out of range rather than describing the
 * prover as unavailable. It is NOT_CHECKED, structurally, so a caller cannot
 * launder a commitment-only result into a privacy claim by mis-scoring it --
 * see proof-provider.ts's own header on exactly this failure mode.
 */
export function describeSoftLandingRangeAttestationPresence(
  proof: ProofResultLike
): AttestationPresenceVerdict {
  const tag = 'trustshell:soft-landing-range:v1';

  if (!proof.witnessHidden) {
    return {
      presence: 'NOT_CHECKED',
      tag,
      detail:
        'witnessHidden=false -- this provider can bind the axis score but cannot hide it ' +
        '(WebCryptoProofProvider today; the hiding provider is blocked on task #75). A ' +
        'commitment-only result is never reported MEASURED under this tag, regardless of ' +
        '`proven` or `predicateHolds` -- see proposal doc §4',
    };
  }

  if (!proof.proven) {
    return {
      presence: 'NOT_CHECKED',
      tag,
      detail: 'witnessHidden=true but proven=false -- no prover actually ran',
    };
  }

  if (!proof.predicateHolds) {
    return {
      presence: 'FAILED',
      tag,
      detail: 'a real hiding proof ran (witnessHidden=true, proven=true) and the claimed range does not hold',
    };
  }

  return {
    presence: 'MEASURED',
    tag,
    detail: 'a real hiding proof ran and the claimed range holds',
  };
}
