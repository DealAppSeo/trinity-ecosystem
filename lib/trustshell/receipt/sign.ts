// lib/trustshell/receipt/sign.ts — self-attestation over a receipt.
//
// §12 Q2 answered: per-developer local key. That decision is what this file has
// to be honest about.
//
// WHAT A SIGNATURE HERE DOES AND DOES NOT MEAN.
//
//   It proves: these bytes have not changed since this key signed them.
//   It does not prove: an independent party checked the session, the claims are
//   true, or the signer is who they say they are.
//
// A developer signing a receipt for their own agent's session is attesting to
// their own homework. That is still worth having — it makes tampering
// detectable and gives the receipt a stable identity — but it is one rung below
// what a reader might assume from a green checkmark. `attestation.kind` carries
// the distinction into the data, and `verifyReceiptSignature` reports it back
// rather than folding it into a pass/fail.
//
// The alternative in §8 is the one that actually closes this: anyone can
// re-derive `auditHash` from `transcriptSha256` and the same transcript bytes,
// with no key and no trust in the signer at all. The signature is convenience;
// re-derivation is the proof.

import { sign, verify, type Did, type KeyPair } from '../identity/did';
import { auditHashFor, markerFor, recomputeReceipt } from './build';
import type { AttestationKind, Marker, SessionReceipt } from './types';

/**
 * Sign `auditHash`, not the core.
 *
 * The hash already commits to every field of the core, so signing it is
 * equivalent and much cheaper — and it means a verifier that has only the hash
 * (from a database row, say) can still check the signature without holding the
 * whole receipt.
 */
export async function signReceipt(
  receipt: SessionReceipt,
  signer: KeyPair,
  kind: Exclude<AttestationKind, 'unsigned'> = 'self'
): Promise<SessionReceipt> {
  // Re-derive rather than trusting the stored hash. Signing a receipt whose
  // auditHash does not match its core would produce a valid signature over a
  // false statement, which is worse than an unsigned receipt.
  const auditHash = await auditHashFor(receipt.core);
  if (auditHash !== receipt.auditHash) {
    throw new Error(
      `signReceipt: auditHash does not match core (stored ${receipt.auditHash}, ` +
        `recomputed ${auditHash}). Rebuild the receipt rather than signing a stale hash.`
    );
  }

  return {
    ...receipt,
    attestation: {
      kind,
      signerDid: signer.did,
      signature: await sign(signer.privateKey, auditHash),
    },
  };
}

export interface SignatureCheck {
  /** Three outcomes. `unsigned` is NOT_CHECKED, not FAILED — see below. */
  outcome: Marker;
  kind: AttestationKind;
  signerDid: Did | null;
  /** Present when the outcome is not VERIFIED. */
  reason: string | null;
  /**
   * True only for `kind: 'org'`. Surfaced so a UI cannot render a self-attested
   * receipt with the same chrome as an independently attested one.
   */
  independentlyAttested: boolean;
}

/**
 * Check the signature, and separately, check the receipt is internally
 * consistent.
 *
 * An unsigned receipt is NOT_CHECKED rather than FAILED. It is a legitimate
 * artifact — §8's re-derivation path needs no signature at all — and scoring it
 * as a failure would push people to sign everything for the green tick, which
 * is the trust-badge failure again.
 */
export async function verifyReceiptSignature(receipt: SessionReceipt): Promise<SignatureCheck> {
  const { kind, signerDid, signature } = receipt.attestation;
  const base = { kind, signerDid, independentlyAttested: kind === 'org' };

  if (kind === 'unsigned' || signature === null || signerDid === null) {
    return {
      ...base,
      outcome: 'NOT_CHECKED',
      reason: 'receipt carries no signature; re-derive auditHash from the transcript instead',
    };
  }

  // The signature covers auditHash. If auditHash does not cover the core, a good
  // signature says nothing about the contents — so this has to be checked first,
  // not reported as a separate green line beside a green signature.
  const recomputed = await recomputeReceipt(receipt);
  if (!recomputed.auditHashMatches) {
    return {
      ...base,
      outcome: 'FAILED',
      reason: `core does not hash to the signed auditHash (expected ${recomputed.expected.auditHash})`,
    };
  }

  let ok: boolean;
  try {
    ok = await verify(signerDid, receipt.auditHash, signature);
  } catch (err) {
    // A malformed DID is a caller bug, not a failed verification. Reporting it
    // as FAILED would let a typo read as "not authorized" and hide the real
    // problem — the same distinction identity/did.ts draws.
    return {
      ...base,
      outcome: 'NOT_CHECKED',
      reason: `signerDid is malformed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!ok) {
    return { ...base, outcome: 'FAILED', reason: 'signature does not verify against signerDid' };
  }

  return { ...base, outcome: 'VERIFIED', reason: null };
}

export interface ReceiptCheck {
  /** The overall marker a surface should render. Never higher than its parts. */
  outcome: Marker;
  markerFromData: Marker;
  auditHashMatches: boolean;
  receiptIdMatches: boolean;
  markerMatches: boolean;
  signature: SignatureCheck;
  reasons: string[];
}

/**
 * The whole check, in one call, with every part still visible.
 *
 * `outcome` is the floor of the parts, never the ceiling: a receipt with a
 * perfect signature over data whose marker is NOT_CHECKED is NOT_CHECKED. A
 * surface that showed the signature's green tick as the headline would be
 * asserting the session was clean because the file was intact.
 */
export async function checkReceipt(receipt: SessionReceipt): Promise<ReceiptCheck> {
  const recomputed = await recomputeReceipt(receipt);
  const signature = await verifyReceiptSignature(receipt);
  const markerFromData = markerFor(receipt.core);
  const reasons: string[] = [];

  if (!recomputed.auditHashMatches) reasons.push('auditHash does not match core');
  if (!recomputed.receiptIdMatches) reasons.push('receiptId does not match auditHash');
  if (!recomputed.markerMatches) {
    reasons.push(`stored marker ${receipt.marker} disagrees with data (${markerFromData})`);
  }
  if (signature.reason) reasons.push(signature.reason);

  const tampered = !recomputed.auditHashMatches || !recomputed.receiptIdMatches || !recomputed.markerMatches;

  let outcome: Marker;
  if (tampered || signature.outcome === 'FAILED' || markerFromData === 'FAILED') {
    outcome = 'FAILED';
  } else if (signature.outcome === 'NOT_CHECKED' || markerFromData === 'NOT_CHECKED') {
    outcome = 'NOT_CHECKED';
  } else {
    outcome = 'VERIFIED';
  }

  return {
    outcome,
    markerFromData,
    auditHashMatches: recomputed.auditHashMatches,
    receiptIdMatches: recomputed.receiptIdMatches,
    markerMatches: recomputed.markerMatches,
    signature,
    reasons,
  };
}

/**
 * The §6 one-liner, rendered from a checked receipt.
 *
 * Takes the check rather than the receipt so it is impossible to render a
 * marker for a receipt nobody verified.
 */
export function formatMarker(receipt: SessionReceipt, check: ReceiptCheck): string {
  const glyph = { VERIFIED: '✓', NOT_CHECKED: '⚠', FAILED: '✗' }[check.outcome];
  const c = receipt.core.claims;
  const a = receipt.core.actions;
  const parts = [
    `${c.total} claims`,
    `${c.verified} backed`,
    c.unchecked > 0 || check.outcome === 'NOT_CHECKED' ? `${c.unchecked} unchecked` : null,
    c.failed > 0 ? `${c.failed} contradicted` : null,
    `${a.toolCalls} actions`,
    `${receipt.core.spend.outputTokens.toLocaleString('en-US')} out`,
  ].filter((p): p is string => p !== null);

  const attest = receipt.attestation.kind === 'self' ? ' (self-attested)' : '';
  return `${glyph} ${check.outcome.replace('_', ' ')}  ${parts.join(' · ')}  ${receipt.receiptId}${attest}`;
}
