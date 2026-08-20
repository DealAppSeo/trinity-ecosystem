// lib/trustshell/x402-settlement-rules.ts
//
// Suite X (docs/policy/phase2-e2e-predicates.md) — decision rules for
// x402 settlements, shaped to consume `x402_settlements`'s REAL columns
// (`is_simulated boolean`, `status text`, verified live against
// `information_schema.columns` this session).
//
// ── UNWIRED, DELIBERATELY, AND SAID SO RATHER THAN LEFT IMPLICIT ───────────
//
// `x402_settlements` exists live in Supabase — real schema, real rows — but a
// repo-wide grep for `x402_settlements` across every `.ts` file in this repo
// returns ZERO hits outside this new file. Nothing reads it, nothing writes
// it, nothing turns a settlement outcome into an S/Q/E axis delta. This
// module is the rules a real caller would need — not a claim that a caller
// exists. Same shadow posture as `attestation-presence.ts` (item B).
//
// This is a genuinely different table from the one `app/api/trustrails/pay/
// route.ts` writes to (Solana execution + `kya_compliance_receipts` — see
// X5's own check in `scripts/phase2-suite-x-test.mjs`, which verifies THAT
// route's real control flow directly instead, since that is the part of
// Suite X actually backed by live code). Conflating the two would overstate
// what either path does.

export interface SettlementLike {
  readonly is_simulated: boolean;
  readonly status: string;
}

export interface SettlementRepidEffect {
  /** X1: simulated settlements permit no positive delta on ANY axis (S, Q, or E). */
  readonly permitsPositiveDelta: boolean;
  /** X2: simulated=true on a settlement is never treated as real collateral. */
  readonly treatsCollateralAsReal: boolean;
  readonly reason: string;
}

/** X1, X2. */
export function settlementRepidEffect(settlement: SettlementLike): SettlementRepidEffect {
  if (settlement.is_simulated) {
    return {
      permitsPositiveDelta: false,
      treatsCollateralAsReal: false,
      reason: 'is_simulated=true — no positive delta on S, Q, or E; collateral is not real',
    };
  }
  return {
    permitsPositiveDelta: true,
    treatsCollateralAsReal: true,
    reason: 'is_simulated=false — may count toward S/Q/E deltas and real collateral',
  };
}

/**
 * X3: a referral qualification via x402 (`authority-policy.v0.5.yaml`'s
 * `referred_nonsim_x402_ge_1`) requires at least one NON-simulated settlement
 * — any number of simulated ones, alone, never qualifies.
 */
export function referralQualifiesViaX402(settlements: readonly SettlementLike[]): boolean {
  return settlements.some((s) => !s.is_simulated);
}

/**
 * X4: a missing Capability Declaration must never promote a simulated
 * settlement to real. `capabilityDeclarationPresent` is accepted and named
 * on the signature so a reader can see the dimension was considered — and is
 * NOT consulted when `is_simulated` is true, on purpose: realness is decided
 * entirely by `is_simulated`, a fact about the settlement, never by the
 * presence or absence of unrelated configuration. The check script asserts
 * this holds under BOTH declaration states, not just the common one.
 */
export function collateralIsReal(settlement: SettlementLike, capabilityDeclarationPresent: boolean): boolean {
  void capabilityDeclarationPresent; // deliberately not read for the is_simulated=true path — see above
  if (settlement.is_simulated) return false;
  return true;
}
