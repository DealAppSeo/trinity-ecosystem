// verdict-envelope.ts — the portable artifact the "portable trust harness" is
// named after.
//
// ── WHAT WAS MISSING ─────────────────────────────────────────────────────────
//
// `verifyVerdict()` already does the cryptography properly: signature, binding
// to the contract hash, the right checker, and the per-criterion floors. But its
// signature is `{ verdict, contract }` — it needs BOTH, and nothing in this repo
// carried them together. So the answer to "can a third party check this?" was
// *yes, if they somehow already hold the contract*, which for an outside party
// is the same as no. There was no artifact to hand anybody.
//
// This is that artifact. One JSON object, self-contained, offline-verifiable.
//
// ── WHY THIS IS THE PRODUCT AND NOT A CONVENIENCE WRAPPER ────────────────────
//
// DeepSeek Harness, Multica and the rest of that ecosystem are strong at
// capability, composition and operations, and they have no answer to "why
// should I trust your evaluator?" — structurally, not by oversight. DSH's
// entire `identity` package is a random UUID for telemetry that is explicitly
// "never derived from the hostname, network address, git remote, or any other
// identifying source", and that mints a fresh identity when the file is deleted
// [read at deepseek-harness@333 commits, 2026-08-15].
//
// That is not weak identity. It is DELIBERATE anti-identity: a privacy choice,
// correctly made, in a system with no primitive that could offer accountability
// and privacy at once. It is also the reason such a system can never vouch for
// its own judge — there is nobody persistent to hold responsible.
//
// We are not in that bind. A `did:key` is self-certifying — the public key IS
// the identifier, so verification needs no registry, no database and no network
// call to us. That is what makes this envelope portable in the strong sense:
// **a third party can verify it with no access to our infrastructure at all.**
// And because zkRepID's unlinkability comes from scope-varying nullifiers
// rather than from throwing identity away, the accountability does not cost the
// privacy DSH was protecting. Anonymous and accountable is the thing on offer.
//
// ── THIS IS THE ONLY MODULE HERE THAT EATS HOSTILE INPUT ─────────────────────
//
// Everything else in `identity/` is handed objects built locally by code that
// already type-checked. An envelope arrives from somebody else. So `envelope`
// is typed `unknown` on the way in and validated field by field, and
// `verifyEnvelope` NEVER THROWS on a malformed one — a hostile or corrupt
// artifact is NOT_CHECKED with a reason, because throwing would let a caller's
// `catch` turn "I could not check this" into whatever the catch block decides,
// and the three-outcome rule exists precisely to stop that collapse.

import { renderEvidence, evidenceDigest } from './contracted-evaluator';
import {
  verifyContract,
  verifyVerdict,
  type ContractVerification,
  type Outcome,
  type Verdict,
  type VerdictVerification,
  type WorkContract,
} from './work-contract';

export const ENVELOPE_DOMAIN = 'zkrepid:trust-envelope:v1';

/**
 * A contract and the verdict that answers it, in one transportable object.
 *
 * Deliberately NOT carrying the evidence itself. Evidence is unbounded — turn
 * records, files, whole transcripts — and an envelope that must ship it is one
 * nobody will ship. The verdict commits to `evidenceHash`, so the holder of the
 * deliverable can prove it is the judged one by recomputing the digest; see
 * `verifyEnvelope`'s `evidence` argument.
 */
export interface TrustEnvelope {
  version: typeof ENVELOPE_DOMAIN;
  contract: WorkContract;
  verdict: Verdict;
}

/**
 * Wrap a contract and its verdict, refusing a pair that could never verify.
 *
 * REFUSED AT MINT TIME, the same rule as `delegateAuditorGrant`: an artifact
 * that exists gets passed around and believed by its description, so the moment
 * to refuse a broken one is before it has a name. A caller that wants to
 * inspect a suspect pair should call `verifyEnvelope` on it instead — that path
 * reports, this path refuses.
 */
export async function packEnvelope(input: {
  contract: WorkContract;
  verdict: Verdict;
}): Promise<TrustEnvelope> {
  const { contract, verdict } = input;
  const check = await verifyContract(contract);

  if (check.outcome !== 'VERIFIED') {
    throw new Error(
      `refusing to pack an envelope around a contract that does not verify: ${check.detail}`
    );
  }
  if (verdict.contractHash !== check.contractHash) {
    throw new Error(
      'refusing to pack an envelope whose verdict names a different contract. The ' +
        'verdict would vouch for criteria this contract does not contain, which is ' +
        'the re-scoping attack arriving as a packaging mistake.'
    );
  }
  if (verdict.checkerDid.trim() !== contract.checkerDid.trim()) {
    throw new Error(
      `refusing to pack an envelope whose verdict was signed by ${verdict.checkerDid} ` +
        `while the contract names ${contract.checkerDid} as checker`
    );
  }
  return { version: ENVELOPE_DOMAIN, contract, verdict };
}

export interface EnvelopeVerification {
  /** The weakest of everything below. VERIFIED asserts most, so any gap revokes it. */
  outcome: Outcome;
  contract: ContractVerification;
  /** Absent when the envelope was too malformed for a verdict check to mean anything. */
  verdict?: VerdictVerification;
  /**
   * Whether supplied evidence is the evidence judged.
   *
   * `null` is a third state and it is the common one: no evidence was supplied,
   * so the question was never asked. Collapsing it to `false` would report a
   * mismatch nobody found; collapsing it to `true` would certify that the
   * verdict covers an artifact nobody compared.
   */
  evidenceMatches: boolean | null;
  /** Who did the work and who judged it, lifted out for a reader. */
  doerDid?: string;
  checkerDid?: string;
  detail: string;
}

/** Weakest wins. Duplicated from work-contract's private `weaker` by necessity. */
function weakest(...outcomes: readonly Outcome[]): Outcome {
  const rank: Record<Outcome, number> = { FAILED: 0, NOT_CHECKED: 1, VERIFIED: 2 };
  return outcomes.reduce((a, b) => (rank[a] <= rank[b] ? a : b), 'VERIFIED' as Outcome);
}

function malformed(detail: string): EnvelopeVerification {
  return {
    outcome: 'NOT_CHECKED',
    contract: {
      outcome: 'NOT_CHECKED',
      doerSignatureValid: false,
      checkerSignatureValid: false,
      independent: false,
      contractHash: '',
      detail: 'not reached',
    },
    evidenceMatches: null,
    detail,
  };
}

/** Structural validation of something that came from outside. */
function asEnvelope(value: unknown): TrustEnvelope | string {
  if (typeof value !== 'object' || value === null) return 'the envelope is not an object';
  const e = value as Partial<TrustEnvelope>;
  if (e.version !== ENVELOPE_DOMAIN) {
    return `unknown envelope version ${JSON.stringify(e.version)}, expected ${ENVELOPE_DOMAIN}`;
  }
  if (typeof e.contract !== 'object' || e.contract === null) return 'the envelope carries no contract';
  if (typeof e.verdict !== 'object' || e.verdict === null) return 'the envelope carries no verdict';
  if (typeof (e.verdict as Verdict).signature !== 'string') return 'the verdict is unsigned';
  if (typeof (e.contract as WorkContract).doerSignature !== 'string') {
    return 'the contract carries no doer signature';
  }
  if (typeof (e.contract as WorkContract).checkerSignature !== 'string') {
    return 'the contract carries no checker signature';
  }
  return e as TrustEnvelope;
}

/**
 * Check an envelope from anybody, offline.
 *
 * Needs no database, no network and no access to us: `did:key` carries its own
 * public key, so every signature here is checkable by the holder alone.
 *
 * @param input.evidence The turn record the holder believes was judged. Supply
 *   it to answer "is this verdict about THIS artifact?" — the question that
 *   turns a signed opinion into a claim about something. Omit it and
 *   `evidenceMatches` is `null`, never `true`.
 */
export async function verifyEnvelope(input: {
  envelope: unknown;
  evidence?: readonly unknown[];
}): Promise<EnvelopeVerification> {
  const parsed = asEnvelope(input.envelope);
  if (typeof parsed === 'string') return malformed(`nothing was checked: ${parsed}`);

  const { contract, verdict } = parsed;

  let contractCheck: ContractVerification;
  let verdictCheck: VerdictVerification;
  try {
    contractCheck = await verifyContract(contract);
    verdictCheck = await verifyVerdict({ verdict, contract });
  } catch (e) {
    // A signature routine that throws on a hostile key is still "we could not
    // check", not "it is invalid". Reporting FAILED here would let a malformed
    // envelope masquerade as a detected forgery.
    return malformed(`the envelope could not be checked: ${(e as Error).message}`);
  }

  let evidenceMatches: boolean | null = null;
  if (input.evidence !== undefined) {
    try {
      evidenceMatches = (await evidenceDigest(renderEvidence(input.evidence))) === verdict.evidenceHash;
    } catch (e) {
      return {
        outcome: 'NOT_CHECKED',
        contract: contractCheck,
        verdict: verdictCheck,
        evidenceMatches: null,
        doerDid: contract.doerDid,
        checkerDid: contract.checkerDid,
        detail: `the supplied evidence could not be digested, so it was not compared: ${(e as Error).message}`,
      };
    }
  }

  const outcome = weakest(
    contractCheck.outcome,
    verdictCheck.outcome,
    evidenceMatches === false ? 'FAILED' : 'VERIFIED'
  );

  const evidenceNote =
    evidenceMatches === null
      ? 'no evidence was supplied, so what this verdict covers is NOT CHECKED'
      : evidenceMatches
        ? 'and the supplied evidence is the evidence judged'
        : 'BUT THE SUPPLIED EVIDENCE IS NOT WHAT WAS JUDGED — the verdict does not cover it';

  return {
    outcome,
    contract: contractCheck,
    verdict: verdictCheck,
    evidenceMatches,
    doerDid: contract.doerDid,
    checkerDid: contract.checkerDid,
    detail: `${verdictCheck.detail}; ${evidenceNote}`,
  };
}
