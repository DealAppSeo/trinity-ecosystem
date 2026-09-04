// lib/trustshell/receipt/types.ts — the session receipt, TrustShell M2.
//
// Spec: docs/TRUSTSHELL-V1.md §5 (schema), §6 (the three-state marker), §11
// ("the harness confabulates" — the failure this file is shaped to prevent).
//
// TWO OPEN SPEC QUESTIONS WERE ANSWERED TO BUILD THIS (§12 Q1, Q2):
//
//   Q1 receipt storage  -> local SQLite first. Private by default, no RLS to
//                          design, no `USING (true)` policy to get wrong. A
//                          Supabase publish is a separate, explicit step.
//   Q2 signing custody  -> per-developer local key.
//
// Q2 has a consequence that has to be carried in the data, not in a README: a
// receipt signed by the developer whose agent produced it is SELF-ATTESTED. It
// proves the bytes have not changed since signing. It does NOT prove an
// independent party checked anything. `attestation.kind` records which of those
// two a reader is holding, because a self-attested receipt read as a third-party
// one is exactly the SSL-padlock-as-trust-badge failure §6 warns about.

import type { ToolOutcome } from '../TranscriptParser';

/** Bumped when the meaning of any field below changes. */
export const RECEIPT_SCHEMA_VERSION = 'trustshell-receipt/1.0.0';

/**
 * Domain tag over the hashed preimage. Separated so a receipt hash can never
 * collide with, or be replayed as, any other signed payload in this codebase
 * (see identity/control-proof.ts DOMAIN for the same discipline).
 */
export const AUDIT_DOMAIN = 'zkrepid:session-receipt:v1';

/** §6. Three outcomes, never two. */
export type Marker = 'VERIFIED' | 'NOT_CHECKED' | 'FAILED';

/**
 * Which checks the ruleset turned on. This is hashed into the receipt, so
 * "claims were not checked" is a signed fact rather than an absence a reader has
 * to notice.
 *
 * M2 ships `actions` and `spend`. Every claim tier is false, and
 * `markerFor` refuses to return VERIFIED while that is the case.
 */
export interface Ruleset {
  actions: boolean;
  spend: boolean;
  /** T0: claims naming a tool/file/PR with no matching tool_use anywhere. */
  claimsT0: boolean;
  /** T1: state claims whose linked tool_result is absent or contradicts. */
  claimsT1: boolean;
  /** T2: claim-vs-evidence judged by a panel. Gated until FPR is measured. */
  claimsT2: boolean;
  /** filesTouched reconciled against `git diff` for the same branch (§4.1). */
  gitReconcile: boolean;
}

export const M2_RULESET: Ruleset = {
  actions: true,
  spend: true,
  claimsT0: false,
  claimsT1: false,
  claimsT2: false,
  gitReconcile: false,
};

export interface ActionsBlock {
  toolCalls: number;
  toolResults: number;
  orphanCalls: number;
  /** Results delivered more than once under one tool_use_id. §3, corrected. */
  duplicateDeliveries: number;
  writeOps: number;
  readOps: number;
  unknownEffectOps: number;
  byOutcome: Record<ToolOutcome, number>;
  filesTouched: string[];
  /**
   * Three outcomes. NOT_CHECKED when the caller supplied no git context — which
   * is the M2 default, because the pure core does not shell out.
   */
  gitDiffReconciled: Marker;
  /** Files the transcript claims were written that git does not show changed. */
  reconcileMismatches: string[];
}

export interface SpendBlock {
  turns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /**
   * What a per-record sum would say, and the ratio. Kept beside the real figure
   * because they differed by 2.36x on the session that produced the spec, and
   * two numbers that far apart must never be reachable by one field name.
   */
  naiveOutputTokens: number;
  overcountFactor: number;
  byModel: Array<{
    model: string;
    turns: number;
    inputTokens: number;
    outputTokens: number;
  }>;
  /** From agent_kya_registry when bound. null means unbound, not zero. */
  declaredLimitDaily: number | null;
  /** NOT_CHECKED when no limit was supplied — absence is not compliance. */
  limitDivergence: Marker;
}

export interface Finding {
  tier: 'T0' | 'T1' | 'T2';
  claimSpan: string;
  evidenceRef: string | null;
  verdict: 'backed' | 'contradicted' | 'unchecked';
}

export interface ClaimsBlock {
  total: number;
  verified: number;
  /** First-class per §6. Silence must never round up to success. */
  unchecked: number;
  failed: number;
  findings: Finding[];
}

/**
 * Everything covered by `auditHash`.
 *
 * DELIBERATELY EXCLUDES anything that changes between runs over identical
 * bytes — no issuedAt, no random id, no hostname. M2's acceptance criterion is
 * that `auditHash` is stable across re-runs of the same transcript, and the
 * cheapest way to guarantee that is to give the hash nothing unstable to eat.
 */
export interface ReceiptCore {
  schemaVersion: string;
  parserVersion: string;
  ruleset: Ruleset;
  /** sha256 of the canonical ruleset — which checks ran, as one value. */
  ruleHash: string;

  sessionId: string | null;
  cwd: string | null;
  gitBranch: string | null;
  /** HEAD at the time the claims were made. null when not supplied. */
  gitHeadSha: string | null;
  startedAt: string | null;
  endedAt: string | null;
  models: string[];

  /** sha256 of the exact transcript bytes. This is what makes it re-derivable. */
  transcriptSha256: string | null;

  actions: ActionsBlock;
  spend: SpendBlock;
  claims: ClaimsBlock;

  /**
   * Set when the harness itself failed partway. §11: an internal error marks the
   * receipt NOT_CHECKED, never VERIFIED. Recorded rather than thrown so the
   * receipt still exists and still says why it is untrustworthy.
   */
  internalErrors: string[];
}

export type AttestationKind =
  /** Signed by the developer whose session this is. Bytes intact; nobody else looked. */
  | 'self'
  /** Signed by a service key held by an org. Still not a claim about correctness. */
  | 'org'
  /** No signature. Integrity depends entirely on transcriptSha256 + auditHash. */
  | 'unsigned';

export interface Attestation {
  kind: AttestationKind;
  /** did:key of the signer. null when unsigned. */
  signerDid: string | null;
  /**
   * bs58 Ed25519 over `${AUDIT_DOMAIN}:attestation|${kind}|${auditHash}`, which
   * binds the attestation kind so a `self` receipt cannot be relabelled `org`.
   * Signatures written before that binding covered bare `auditHash`; they still
   * verify, but `verifyReceiptSignature` reports `kindBound: false` and refuses
   * to grant `independentlyAttested` on their strength. null when unsigned.
   */
  signature: string | null;
}

export interface SessionReceipt {
  /** ts_<base32(auditHash)[:16]> — derived, so two identical cores collide by design. */
  receiptId: string;
  core: ReceiptCore;
  /** sha256 hex of `${AUDIT_DOMAIN}|${canonicalJson(core)}`. */
  auditHash: string;
  /**
   * Derived from `core` by `markerFor`. Present for readability only — a
   * verifier MUST recompute it rather than trust it, because it sits outside the
   * hash. Stated here so nobody wires a UI to the stored value.
   */
  marker: Marker;
  attestation: Attestation;
}
