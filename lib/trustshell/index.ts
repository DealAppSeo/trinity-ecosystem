// lib/trustshell/index.ts
// TrustShell Sprint — Created March 26 2026 by Gemini
//
// The APPLICATION barrel: the portable surface, plus the host adapters.
//
// Split from `portable.ts` on 2026-08-19. Everything host-free moved there; this
// file re-exports it and adds the nine modules that reach `@/lib/supabase-admin`
// and `@/lib/trust/BFTEngine`. Consumers importing from '@/lib/trustshell' see
// exactly what they saw before — the split is invisible here and load-bearing
// there, because re-exporting these adapters is what made the old barrel
// unimportable outside this repo.
//
// ADDING AN EXPORT: if it has no host dependency it belongs in `portable.ts`.
// Putting it here instead does not break anything visibly — it just quietly
// keeps one more module out of the package. `check:package-boundary` names the
// nine adapters, so a tenth fails the build rather than sliding in.

export * from './portable';

// ---------------------------------------------------------------------------
// The host adapters. Each reaches outside the package, deliberately.
// ---------------------------------------------------------------------------

export { KYAValidator }         from './KYAValidator';
export { BFTAuthorizer }        from './BFTAuthorizer';
export { ComplianceReceiptGenerator } from './ComplianceReceipt';
export { VaultPermissionGate }  from './VaultPermission';
export { RepIDCalculator }      from './RepIDConfig';
export { ZKPAttestationService } from './ZKPAttestation';
export { EarnedMetricsRepository, OBSERVATION_WINDOW_DAYS, MAX_OBSERVATIONS } from './EarnedMetricsRepo';
export type { EarnedMetricsLoad } from './EarnedMetricsRepo';

/**
 * The one write that makes a RepID reward payable exactly once.
 *
 * An adapter by construction — it exists to run a single conditional UPDATE
 * against `kya_compliance_receipts`, whose `receipt_id` is UNIQUE. The decisions
 * it classifies live in `reward-idempotency.ts` with zero imports and are
 * exported from `portable.ts`, so the logic ships and the storage does not.
 */
export { RewardLedger } from './RewardLedger';
export type { ClaimResult } from './RewardLedger';
