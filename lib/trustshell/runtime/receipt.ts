// lib/trustshell/runtime/receipt.ts — the (minimal) Trust Receipt.
//
// Every disposition the runtime makes emits ONE receipt: what was proposed, under
// what authority, with what evidence, and what actually happened. It is the record
// that makes "every committed action produces a receipt" checkable, and the seed
// of the canonical-evidence Trust Lens loop. (docs/TRUSTHARNESS-STRATEGY.md §3.3;
// brief points 7 and 9.)
//
// STORE EVIDENCE, NEVER A BAKED SCORE. The receipt keeps a reference to the
// evidence a validator (HAL) supplied — its confidence, source, and availability
// STATE (enabled / disabled / unavailable) — not a reputation number. Reputation
// is a versioned Trust Lens applied to canonical evidence LATER; baking a score
// here would be the thing the architecture exists to avoid. This is deliberately
// the MINIMAL receipt: the full canonical evidence-row schema (freshness windows,
// validator/composition lineage, on-chain anchoring) is the next PR. What is here
// is enough to prove the loop and to hash for integrity.
//
// INTEGRITY HASH, NOT A COMMITMENT. `integrityHash` is a SHA-256 over the receipt's
// canonical serialization — a real content-integrity hash that detects tampering
// with a stored receipt. It is NOT a signature and NOT an on-chain commitment;
// signing/anchoring is the AttestationSink interface's job (EAS, later). Named
// honestly, per this repo's discipline.

import { createHash } from 'node:crypto';
import type { Decision } from '../kernel/policy';

/** The availability state of the evidence a validator returned. */
export type EvidenceState = 'enabled' | 'disabled' | 'unavailable';

/** A reference to the evidence consulted — the input to a decision, not a score. */
export interface ReceiptEvidence {
  readonly confidence: number | null;
  readonly source: string | null;
  readonly state: EvidenceState;
}

export type Outcome = 'committed' | 'blocked' | 'error';

/** Everything hashed into `integrityHash` (the receipt minus the hash itself). */
export interface ReceiptBody {
  readonly requestId: string;
  readonly principal: string;
  readonly capability: string;
  readonly tool: string;
  readonly targetResource: string;
  /** Binds the exact arguments that were authorized (the Envelope's argsHash). */
  readonly argsHash: string;
  /** Which constitution governed this action. */
  readonly constitutionFingerprint: string;
  /** Which agent composition acted (identity+composition lineage; minimal for now). */
  readonly composition: string;
  readonly decision: Decision;
  readonly firedRule: string | null;
  readonly evidence: ReceiptEvidence | null;
  /** Was the executor INVOKED? True exactly when the verdict was ALLOW and the
   *  action ran — whether it `committed` or `error`ed. A file lands on disk iff
   *  `outcome === 'committed'`; `executed` is the weaker "we ran the effect". */
  readonly executed: boolean;
  readonly outcome: Outcome;
  readonly outcomeDetail: string;
  /** ISO 8601, from the injected clock — receipts are reproducible in tests. */
  readonly at: string;
  readonly nonce: string;
}

export interface TrustReceipt extends ReceiptBody {
  /** SHA-256 over the canonical serialization of the body. */
  readonly integrityHash: string;
}

/** Deterministic canonical JSON: keys sorted at every level. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** SHA-256 hex of a receipt body's canonical form. */
export function receiptIntegrityHash(body: ReceiptBody): string {
  return 'sha256:' + createHash('sha256').update(canonical(body)).digest('hex');
}

/**
 * SHA-256 of the canonical form of an argument bundle. The Envelope carries only
 * this hash (not the args), so the runtime binds the exact arguments that were
 * authorized: if the args handed to the executor do not hash to the Envelope's
 * `argsHash`, they were swapped after authorization and must not run.
 */
export function hashArgs(args: unknown): string {
  return 'sha256:' + createHash('sha256').update(canonical(args)).digest('hex');
}

/** Build a receipt from its body, sealing it with an integrity hash. */
export function buildReceipt(body: ReceiptBody): TrustReceipt {
  return { ...body, integrityHash: receiptIntegrityHash(body) };
}

/** Re-derive the hash and compare — true when the receipt has not been tampered with. */
export function verifyReceiptIntegrity(receipt: TrustReceipt): boolean {
  const { integrityHash, ...body } = receipt;
  return receiptIntegrityHash(body) === integrityHash;
}
