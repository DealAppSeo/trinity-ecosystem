// lib/trustshell/kernel/index.ts — the Trust Microkernel core.
//
// The smallest viable kernel (docs/TRUSTHARNESS-STRATEGY.md §5): the Personal
// Constitution (what it protects), the Trust/Action Envelope (the one path to a
// side effect), the deterministic policy engine (dispose → ALLOW/DENY/ASK/VERIFY),
// and the fail-closed gate (runs an action only on ALLOW). Everything else —
// Cedar as a swappable PolicyEngine driver, capability-minting, the Trust Receipt
// AttestationSink — is a later interface behind this boundary.

export type {
  TrustActionEnvelope,
  Reversibility,
  DataClassification,
  RiskClass,
  NormalizeResult,
  NormalizeOk,
  NormalizeErr,
} from './envelope';
export {
  normalizeEnvelope,
  REVERSIBILITY,
  DATA_CLASSIFICATION,
  RISK_CLASS,
} from './envelope';

export type {
  Constitution,
  HardRule,
  SoftPreference,
  HardEffect,
  Condition,
  StringField,
} from './constitution';
export {
  DEFAULT_CONSTITUTION,
  conditionMatches,
  constitutionFingerprint,
} from './constitution';

export type {
  Decision,
  Verdict,
  DecisionContext,
  VerificationEvidence,
} from './policy';
export { dispose } from './policy';

export type { GateResult, GateAllowed, GateBlocked } from './gate';
export { guardedExecute } from './gate';
