// lib/trustshell/identity/work-contract.ts
//
// The pre-execution contract and the signed verdict that answers it.
//
// Build order step 3 (docs/TRUST-HARNESS-DESIGN-2026-08-15.md §5), plus the
// practical half of the accountable-verifier claim in §3. Both papers converged
// on the same mechanism from opposite directions: success criteria are agreed
// BEFORE the work, not asserted after it.
//
// ── WHAT THIS ACTUALLY PROVES, AND WHAT IT DOES NOT ──────────────────────────
//
// It is tempting to say this proves the criteria were fixed before the work.
// **It does not, and claiming so would be exactly the kind of unearned claim
// this file exists to prevent.** Signatures prove WHO agreed to WHAT. They do
// not prove WHEN: an honest timestamp and a backdated one are the same bytes,
// and nothing here consults a clock it did not receive from a caller.
//
// What it does prove, and what turns out to be the property that matters:
//
//   * WHO judged — the verdict carries the checker's DID and its signature.
//   * AGAINST WHAT — the verdict names `contractHash`, so the criteria cannot
//     be silently re-scoped once the outcome is known. A checker that wants to
//     grade against easier criteria must produce a different contract, which
//     needs the doer's signature too, and shows up as a different hash.
//   * THAT BOTH PARTIES AGREED — a contract needs two signatures over one
//     payload, so neither side can invent the criteria alone.
//   * THAT THE CHECKER WAS NOT THE DOER — checked by DID comparison, which a
//     third party can repeat without trusting us.
//
// Re-scoping after the fact is the failure mode actually observed in this repo:
// four retractions, and the recurring shape was a claim that quietly moved to
// fit whatever the measurement turned out to support. Ordering attacks are
// hypothetical here; re-scoping is not. This closes the one that happens.
//
// Getting real ordering needs a timestamp authority, a chain anchor, or the
// contract hash published somewhere append-only before the run. All three are
// available to us later; none is pretended to here.
//
// ── WHY A VERDICT CANNOT MOVE REPUTATION BY ITSELF ───────────────────────────
//
// `veritas_catch` and `veritas_miss` are the signals that say a checker was
// right or wrong. If a verdict could emit them, the checker's score would rise
// merely by rendering verdicts — self-certification moved up one layer, which
// is precisely the failure the independent-evaluator design exists to prevent
// (§4.1, the open ground-truth problem).
//
// So the type system refuses it. `veritasSignal()` takes a verdict AND a
// `GroundTruthObservation`, and there is no path from one to the other. The
// observation must come from outside — a human spot-check, a downstream
// outcome, a held-out stronger judge, or a disagreeing independent checker —
// and an observation whose observer is the checker itself is REJECTED rather
// than merely discouraged.
//
// This does not solve the ground-truth problem. It makes the gap impossible to
// close by accident, which is the honest thing to do with an open problem: the
// missing piece stays missing and visible instead of being quietly filled by
// the party it is supposed to constrain.

import { sign, verify, type Did } from './did';

export const CONTRACT_DOMAIN = 'zkrepid:work-contract:v1';
export const VERDICT_DOMAIN = 'zkrepid:work-verdict:v1';

/** Three outcomes, never two — the same vocabulary as the loop kernel. */
export type Outcome = 'VERIFIED' | 'NOT_CHECKED' | 'FAILED';

/**
 * Field separator for canonical encodings.
 *
 * Written as an escape, never as a raw byte. A literal U+001F in source has
 * landed here twice and both times was caught by a byte scan rather than by
 * reading — it is invisible in every editor and survives review.
 */
const FIELD_SEP = '\u001f';

/**
 * One agreed success criterion.
 *
 * `minScore` is a hard floor with no averaging: one criterion below its floor
 * fails the unit of work. A mean would let a strong result pay for a broken
 * one, which is the arithmetic form of shipping a feature with its security
 * check stubbed and calling it 90% done.
 */
export interface ContractCriterion {
  id: string;
  statement: string;
  /** Hard floor in [0, 1]. A score below it fails, whatever the checker says. */
  minScore?: number;
}

export interface UnsignedContract {
  version: typeof CONTRACT_DOMAIN;
  taskId: string;
  /** What is to be produced. Prose; the criteria are what actually bind. */
  deliverable: string;
  criteria: readonly ContractCriterion[];
  /** Who does the work. */
  doerDid: Did;
  /** Who judges it. MUST differ from `doerDid` — checked, not assumed. */
  checkerDid: Did;
  /** Self-asserted. Recorded for correlation, never treated as proof of ordering. */
  proposedAt: string;
}

export interface WorkContract extends UnsignedContract {
  /** Over `contractPayload`, by the doer. */
  doerSignature: string;
  /** Over the SAME payload, by the checker. Agreement, not acknowledgement. */
  checkerSignature: string;
}

/**
 * Canonical encoding of everything both signatures cover.
 *
 * Spelled out field by field rather than `JSON.stringify`: key order is not
 * guaranteed across a round trip, so a stringify-based signature verifies on
 * the machine that made it and fails everywhere else. `harness-bundle.ts` has
 * the same note for the same reason.
 *
 * `minScore` IS INSIDE THE SIGNATURE. Leaving it out would let a floor be
 * lowered after both parties signed while the hash stayed the same, which is
 * re-scoping through the back door and is the whole attack this file exists to
 * detect.
 *
 * Criteria are encoded IN ORDER, and the honest reason is narrower than the
 * first draft of this comment claimed. It said sorting would let a checker
 * reorder criteria undetectably; that is not a real attack, because duplicate
 * ids are already refused and a reordered set of criteria means the same thing.
 * The actual reason is that sorting makes two different DOCUMENTS hash
 * identically. A contract is something a person reads and signs, and a hash
 * that cannot distinguish two orderings has stopped identifying the thing that
 * was agreed to. That is worth keeping; the security claim was not earned.
 */
export function contractPayload(c: UnsignedContract): string {
  const criteria = c.criteria
    .map((k) => [k.id, k.statement, k.minScore === undefined ? '' : String(k.minScore)].join('\u001e'))
    .join(FIELD_SEP);
  return [
    CONTRACT_DOMAIN,
    c.taskId,
    c.deliverable,
    String(c.criteria.length),
    criteria,
    c.doerDid,
    c.checkerDid,
    c.proposedAt,
  ].join('|');
}

/**
 * Reject any field that could forge a boundary in the canonical encoding.
 *
 * Without this, `{id: 'a|b', statement: 'c'}` and `{id: 'a', statement: 'b|c'}`
 * produce identical bytes and therefore identical signatures — two different
 * contracts one signature covers. The same class of bug was found and fixed in
 * `reputation-transition.ts`, where `join('')` let `{value:1,observedAt:'2026'}`
 * collide with `{value:12,observedAt:'026'}`.
 *
 * REFUSED, not escaped. An escaping scheme is another encoding to get wrong,
 * and no legitimate criterion id or DID contains a control byte.
 */
function refuseSeparators(where: string, value: string): void {
  if (value.includes('|') || value.includes(FIELD_SEP) || value.includes('\u001e')) {
    throw new Error(
      `${where} contains a field separator ('|', U+001F or U+001E) and is refused. ` +
        'Separators inside a field let two different contracts encode identically, so ' +
        'one signature would cover both.'
    );
  }
}

function assertContractSane(c: UnsignedContract): void {
  if (c.criteria.length === 0) {
    throw new Error(
      'a contract with no criteria is refused. Judging against nothing establishes ' +
        'nothing, and an empty contract would be the cheapest route past the checker.'
    );
  }
  if (c.doerDid.trim() === c.checkerDid.trim()) {
    throw new Error(
      `the doer and the checker are the same identity (${c.doerDid}). ` +
        'verification.checker_must_not_be_doer is constitutional — no layer may waive it.'
    );
  }
  const seen = new Set<string>();
  for (const k of c.criteria) {
    refuseSeparators(`criterion id '${k.id}'`, k.id);
    refuseSeparators(`criterion '${k.id}' statement`, k.statement);
    if (seen.has(k.id)) {
      throw new Error(
        `criterion id '${k.id}' appears twice. Duplicate ids make a verdict ambiguous ` +
          'about which criterion it answered.'
      );
    }
    seen.add(k.id);
    if (k.minScore !== undefined && !(k.minScore >= 0 && k.minScore <= 1)) {
      throw new Error(
        `criterion '${k.id}' has a floor of ${k.minScore}, which is outside [0, 1]. ` +
          'An unreachable floor fails every run; a negative one passes every run.'
      );
    }
  }
  refuseSeparators('taskId', c.taskId);
  refuseSeparators('deliverable', c.deliverable);
  refuseSeparators('doerDid', c.doerDid);
  refuseSeparators('checkerDid', c.checkerDid);
}

/** The doer's half. Not yet a contract — one signature is a proposal. */
export async function proposeContract(input: {
  unsigned: UnsignedContract;
  doerKey: CryptoKey;
}): Promise<{ unsigned: UnsignedContract; doerSignature: string }> {
  assertContractSane(input.unsigned);
  return {
    unsigned: input.unsigned,
    doerSignature: await sign(input.doerKey, contractPayload(input.unsigned)),
  };
}

/**
 * The checker's half, over the SAME payload the doer signed.
 *
 * Amendment is deliberately not a mutation: a checker that wants different
 * criteria proposes a new contract, which needs the doer's signature again.
 * Allowing the checker to amend in place would let the judge write the exam.
 */
export async function countersignContract(input: {
  unsigned: UnsignedContract;
  doerSignature: string;
  checkerKey: CryptoKey;
}): Promise<WorkContract> {
  assertContractSane(input.unsigned);
  const payload = contractPayload(input.unsigned);
  if (!(await verify(input.unsigned.doerDid, payload, input.doerSignature))) {
    throw new Error(
      "the doer's signature does not verify against this payload, so there is nothing to " +
        'countersign. A contract signed by one party is not an agreement.'
    );
  }
  return {
    ...input.unsigned,
    doerSignature: input.doerSignature,
    checkerSignature: await sign(input.checkerKey, payload),
  };
}

export interface ContractVerification {
  outcome: Outcome;
  doerSignatureValid: boolean;
  checkerSignatureValid: boolean;
  /** Whether checker ≠ doer held. Constitutional, so failure is FAILED not NOT_CHECKED. */
  independent: boolean;
  contractHash: string;
  detail: string;
}

/**
 * Verify a contract. Three outcomes, and the middle one is load-bearing.
 *
 * A malformed contract that cannot be encoded is NOT_CHECKED, not FAILED: we
 * could not look, which is a different fact from looking and finding it invalid.
 * A signature that verifies as false IS FAILED — we looked, and it is wrong.
 */
export async function verifyContract(contract: WorkContract): Promise<ContractVerification> {
  let payload: string;
  try {
    assertContractSane(contract);
    payload = contractPayload(contract);
  } catch (e) {
    return {
      outcome: 'NOT_CHECKED',
      doerSignatureValid: false,
      checkerSignatureValid: false,
      independent: false,
      contractHash: '',
      detail: `the contract could not be canonically encoded, so nothing was checked: ${(e as Error).message}`,
    };
  }

  const [doerOk, checkerOk, hash] = await Promise.all([
    verify(contract.doerDid, payload, contract.doerSignature),
    verify(contract.checkerDid, payload, contract.checkerSignature),
    hashPayload(payload),
  ]);
  // assertContractSane already refused a self-checked contract, so reaching here
  // means it held. Recomputed rather than assumed, so the field is evidence
  // rather than a restatement of the caller's input.
  const independent = contract.doerDid.trim() !== contract.checkerDid.trim();

  if (doerOk && checkerOk && independent) {
    return {
      outcome: 'VERIFIED',
      doerSignatureValid: true,
      checkerSignatureValid: true,
      independent: true,
      contractHash: hash,
      detail: `both parties signed these ${contract.criteria.length} criteria, and the checker is not the doer`,
    };
  }
  const why = [
    doerOk ? null : "the doer's signature does not verify",
    checkerOk ? null : "the checker's signature does not verify",
    independent ? null : 'the checker is the doer',
  ].filter(Boolean);
  return {
    outcome: 'FAILED',
    doerSignatureValid: doerOk,
    checkerSignatureValid: checkerOk,
    independent,
    contractHash: hash,
    detail: `the contract is not valid: ${why.join('; ')}`,
  };
}

// ---------------------------------------------------------------------------
// The verdict
// ---------------------------------------------------------------------------

export interface CriterionScore {
  criterionId: string;
  outcome: Outcome;
  /** In [0, 1] when scored. ABSENT IS NOT A PASS — a floor with no score is untested. */
  score?: number;
}

export interface UnsignedVerdict {
  version: typeof VERDICT_DOMAIN;
  /** Binds this verdict to exactly the criteria both parties signed. */
  contractHash: string;
  /**
   * A hash over what was judged.
   *
   * Without it a verdict says "this work passed" while naming no work, and the
   * same signed verdict would vouch for any artifact anyone later paired it
   * with.
   */
  evidenceHash: string;
  checkerDid: Did;
  /**
   * Reference to the ControlProof that authorized this checker — its signature
   * is enough to identify it uniquely.
   *
   * Absent means the checker's authority is UNVERIFIED, not that it had none.
   * Recorded as a gap rather than defaulted to either answer.
   */
  controlProofRef?: string;
  outcome: Outcome;
  scores: readonly CriterionScore[];
  issuedAt: string;
}

export interface Verdict extends UnsignedVerdict {
  signature: string;
}

export function verdictPayload(v: UnsignedVerdict): string {
  const scores = v.scores
    .map((s) => [s.criterionId, s.outcome, s.score === undefined ? '' : String(s.score)].join('\u001e'))
    .join(FIELD_SEP);
  return [
    VERDICT_DOMAIN,
    v.contractHash,
    v.evidenceHash,
    v.checkerDid,
    v.controlProofRef ?? '',
    v.outcome,
    String(v.scores.length),
    scores,
    v.issuedAt,
  ].join('|');
}

export async function issueVerdict(input: {
  unsigned: UnsignedVerdict;
  checkerKey: CryptoKey;
}): Promise<Verdict> {
  const v = input.unsigned;
  refuseSeparators('contractHash', v.contractHash);
  refuseSeparators('evidenceHash', v.evidenceHash);
  refuseSeparators('checkerDid', v.checkerDid);
  for (const s of v.scores) refuseSeparators(`score for '${s.criterionId}'`, s.criterionId);
  if (!v.contractHash) {
    throw new Error(
      'a verdict with no contractHash is refused. An unbound verdict grades against ' +
        'criteria nobody agreed to, which is the re-scoping this design exists to prevent.'
    );
  }
  if (!v.evidenceHash) {
    throw new Error(
      'a verdict with no evidenceHash is refused. It would vouch for any artifact ' +
        'later paired with it.'
    );
  }
  return { ...v, signature: await sign(input.checkerKey, verdictPayload(v)) };
}

export interface VerdictVerification {
  outcome: Outcome;
  signatureValid: boolean;
  /** Whether the verdict answers the contract it was checked against. */
  boundToContract: boolean;
  /** Whether every agreed criterion got a score, and every floor was met. */
  criteriaOutcome: Outcome;
  verdictHash: string;
  detail: string;
}

/**
 * Verify a verdict against the contract it claims to answer.
 *
 * THE FLOORS ARE ENFORCED HERE, not taken from the checker's own outcome field.
 * A checker that reports VERIFIED with a score under an agreed floor is
 * overruled — otherwise a floor is only as strong as the judge it exists to
 * constrain, and this whole file is about not trusting the judge more than the
 * cryptography requires.
 */
export async function verifyVerdict(input: {
  verdict: Verdict;
  contract: WorkContract;
}): Promise<VerdictVerification> {
  const { verdict, contract } = input;
  const contractCheck = await verifyContract(contract);
  const payload = verdictPayload(verdict);
  const [sigOk, verdictHash] = await Promise.all([
    verify(verdict.checkerDid, payload, verdict.signature),
    hashPayload(payload),
  ]);

  if (contractCheck.outcome !== 'VERIFIED') {
    return {
      outcome: contractCheck.outcome === 'NOT_CHECKED' ? 'NOT_CHECKED' : 'FAILED',
      signatureValid: sigOk,
      boundToContract: false,
      criteriaOutcome: 'NOT_CHECKED',
      verdictHash,
      detail: `the contract itself did not verify, so the verdict answers nothing: ${contractCheck.detail}`,
    };
  }

  const bound = verdict.contractHash === contractCheck.contractHash;
  // The checker named on the contract must be the one that signed the verdict.
  // Without this, a valid contract plus a valid verdict from an unrelated
  // identity would pass every individual check while the agreed checker never
  // judged anything.
  const rightChecker = verdict.checkerDid.trim() === contract.checkerDid.trim();
  const criteria = scoreAgainstContract(contract.criteria, verdict.scores);

  if (!sigOk || !bound || !rightChecker) {
    const why = [
      sigOk ? null : "the checker's signature does not verify",
      bound ? null : 'the verdict names a different contract hash',
      rightChecker ? null : `the verdict was signed by ${verdict.checkerDid}, not the agreed checker`,
    ].filter(Boolean);
    return {
      outcome: 'FAILED',
      signatureValid: sigOk,
      boundToContract: bound,
      criteriaOutcome: criteria.outcome,
      verdictHash,
      detail: `the verdict is not valid: ${why.join('; ')}`,
    };
  }

  return {
    outcome: criteria.outcome,
    signatureValid: true,
    boundToContract: true,
    criteriaOutcome: criteria.outcome,
    verdictHash,
    detail: `${contract.checkerDid} signed this verdict against the agreed contract; ${criteria.detail}`,
  };
}

/** Weakest of the two claims. VERIFIED asserts most, so it is what a gap revokes. */
function weaker(a: Outcome, b: Outcome): Outcome {
  const rank: Record<Outcome, number> = { FAILED: 0, NOT_CHECKED: 1, VERIFIED: 2 };
  return rank[a] <= rank[b] ? a : b;
}

function scoreAgainstContract(
  criteria: readonly ContractCriterion[],
  scores: readonly CriterionScore[]
): { outcome: Outcome; detail: string } {
  // On duplicate ids keep the WEAKER: a checker that contradicts itself must not
  // get to pick which answer counts by reordering its own output.
  const byId = new Map<string, CriterionScore>();
  for (const s of scores) {
    const existing = byId.get(s.criterionId);
    if (!existing || weaker(s.outcome, existing.outcome) === s.outcome) byId.set(s.criterionId, s);
  }

  let worst: Outcome = 'VERIFIED';
  const notes: string[] = [];
  for (const k of criteria) {
    const s = byId.get(k.id);
    if (!s) {
      worst = weaker(worst, 'NOT_CHECKED');
      notes.push(`'${k.id}' was not answered`);
      continue;
    }
    let floor: Outcome = 'VERIFIED';
    if (k.minScore !== undefined) {
      if (typeof s.score !== 'number' || !Number.isFinite(s.score) || s.score < 0 || s.score > 1) {
        floor = 'NOT_CHECKED';
        notes.push(`'${k.id}' has a floor of ${k.minScore} and no usable score, so it was never tested`);
      } else if (s.score < k.minScore) {
        floor = 'FAILED';
        notes.push(`'${k.id}' scored ${s.score}, below its agreed floor of ${k.minScore}`);
      }
    }
    if (s.outcome !== 'VERIFIED') notes.push(`'${k.id}' was judged ${s.outcome}`);
    worst = weaker(worst, weaker(s.outcome, floor));
  }

  if (worst === 'VERIFIED') {
    return { outcome: 'VERIFIED', detail: `all ${criteria.length} agreed criteria were met` };
  }
  return { outcome: worst, detail: `${worst}: ${notes.join('; ')}` };
}

// ---------------------------------------------------------------------------
// Ground truth — the gap, kept visible
// ---------------------------------------------------------------------------

/**
 * Where a later, independent answer about the same work came from.
 *
 * None of these is available at verdict time. That is the point: every one of
 * them arrives afterwards and from somewhere the checker does not control,
 * which is what makes them capable of grading the checker.
 */
export type GroundTruthSource =
  /** A person looked at the same artifact. Expensive, and the strongest reference. */
  | 'human_review'
  /** The accepted work later succeeded or failed in the real environment. */
  | 'downstream_outcome'
  /** A stronger, more expensive judge run on a held-out sample. */
  | 'held_out_judge'
  /** A different checker, independently authorized, reached a different answer. */
  | 'cross_checker';

export interface GroundTruthObservation {
  /** Which verdict is being graded. */
  verdictHash: string;
  source: GroundTruthSource;
  /** What later turned out to be true about the work. */
  actual: Outcome;
  /** Who or what produced this observation. MUST NOT be the checker being graded. */
  observerDid?: Did;
  observedAt: string;
}

/**
 * Turn a verdict plus an external observation into a reputation signal.
 *
 * TWO ARGUMENTS, AND THAT IS THE WHOLE DESIGN. There is deliberately no
 * one-argument form. A checker's score must not be able to rise by rendering
 * verdicts, and the cheapest way to guarantee that is to make the signal
 * uncomputable without something the checker did not produce.
 *
 * Returns `null` when the observation cannot grade the verdict — an unmatched
 * hash, or a NOT_CHECKED on either side. A NOT_CHECKED verdict is not a miss:
 * a checker that correctly reported it could not look was right to, and
 * scoring that as an error would teach it to guess.
 */
export function veritasSignal(
  verdict: Verdict,
  verdictHash: string,
  observation: GroundTruthObservation
): 'veritas_catch' | 'veritas_miss' | null {
  if (observation.verdictHash !== verdictHash) return null;

  // THE STRUCTURAL GUARD. An observation from the checker being graded is not
  // ground truth, it is the same self-certification wearing a different hat —
  // and the panel grading its own prior verdicts is the specific version of it
  // that would look most convincing in a dashboard.
  if (observation.observerDid && observation.observerDid.trim() === verdict.checkerDid.trim()) {
    throw new Error(
      `the observation was produced by ${observation.observerDid}, which is the checker ` +
        'being graded. A checker cannot supply the ground truth for its own verdict — ' +
        'that is self-certification one layer up, and it is the failure this whole ' +
        'design exists to prevent.'
    );
  }

  // Neither side can grade the other through a NOT_CHECKED. "We did not look"
  // is not a wrong answer, and treating it as one rewards guessing over
  // admitting a gap — which would invert the incentive the third outcome exists
  // to create.
  if (verdict.outcome === 'NOT_CHECKED' || observation.actual === 'NOT_CHECKED') return null;

  return verdict.outcome === observation.actual ? 'veritas_catch' : 'veritas_miss';
}

// ---------------------------------------------------------------------------

async function hashPayload(payload: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `sha256:${hex}`;
}
