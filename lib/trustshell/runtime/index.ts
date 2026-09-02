// lib/trustshell/runtime/index.ts — the execution runtime around the kernel.
//
// The vertical slice: ONE real side-effect action path composed from the kernel
// core (lib/trustshell/kernel) plus the minimal pieces a real effect needs — a
// TTL/attenuate-only CapabilityMinter, a Trust Receipt, an idempotent runtime, and
// one reference executor (a file write). It proves the brief's point-9 invariants
// against a genuine effect. The canonical-evidence Trust Lens loop builds on the
// receipt here; TTL capability infrastructure, budgets, and the Envelope state
// machine are later interfaces.

export type { CapabilityGrant, MintInput, AttenuateInput, AttenuateOk, AttenuateErr } from './capability';
export {
  mintCapability,
  attenuate,
  isSubCapability,
  isGrantValid,
  resolveGrantedCapabilities,
} from './capability';

export type { TrustReceipt, ReceiptBody, ReceiptEvidence, EvidenceState, Outcome } from './receipt';
export { buildReceipt, receiptIntegrityHash, verifyReceiptIntegrity, hashArgs } from './receipt';

export type { ExecutionResult, Executor, ExecutionLedger, RunInput, RunOutput } from './execute';
export { runAction, InMemoryLedger } from './execute';

export type { FileWriteArgs } from './file-executor';
export { makeFileWriteExecutor } from './file-executor';
