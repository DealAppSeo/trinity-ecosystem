// lib/trustshell/identity/handoff.ts
//
// The signed handoff artifact: what one session hands the next.
//
// Build order step 7. Both source harnesses converged on a handoff carrying the
// goal, the checkpoints reached, and what failed. Theirs is prose, and prose
// cannot be checked. Ours is the same three things, made tamper-evident — which
// is only worth doing if it closes a failure prose actually has.
//
// ── THE FAILURE IT CLOSES: TRANSITIVE CLAIM INFLATION ────────────────────────
//
// This is the house defect crossing a session boundary, and it is worse there
// than anywhere else because nobody watches it happen:
//
//   session 1  the harness records NOT_CHECKED — a tool was unreachable
//   session 2  reads the handoff, writes "prior work established X"
//   session 3  builds on X as settled fact
//
// No step is a lie. Each is a reasonable compression of the one before, and
// three hops later an unreachable host has become a foundation. A prose handoff
// makes this invisible by construction: there is nothing in it that could
// disagree with the summary.
//
// So the rule this file exists to enforce is the claim ceiling, applied across
// sessions rather than within one:
//
//   **A HANDOFF CANNOT ASSERT A CHECKPOINT STRONGER THAN THE EVIDENCE
//   TRAVELLING WITH IT.**
//
// ── WHY A HASH IS NOT EVIDENCE ───────────────────────────────────────────────
//
// The tempting design cites `verdictHash` and stops. That makes the artifact
// small and self-consistent and proves nothing to a reader: a hash is a
// COMMITMENT, and a commitment you cannot open is indistinguishable from one
// that opens to nothing. An artifact whose claims are checkable only by the
// party that wrote it is the thing prose already was.
//
// So verification is two-tier, and the tiers are never conflated:
//
//   STRUCTURAL   the claim is well-formed — it names a verdict, a contract, and
//                a checker that is not the agent handing off.
//   EVIDENTIAL   the reader supplies the actual Verdict and WorkContract, and
//                they are checked against the claim.
//
// **A reader who cannot open the evidence sees NOT_CHECKED, not VERIFIED.** Not
// as a failure — the handoff may be perfectly honest — but because "I cannot
// see what you cite" and "I checked what you cite" are different facts and the
// whole design rests on never merging them.
//
// ── THE SPLICE, WHICH IS THIS FORMAT'S VERSION OF harness-bundle's ───────────
//
// `harness-bundle.ts` learned that every part verifying is not the same as the
// bundle being coherent: agent A's authority plus agent B's reputation are both
// genuinely signed and together are a forgery.
//
// The handoff has the same shape one level up. A VERIFIED verdict from task A,
// cited as a checkpoint of task B, is a genuinely signed verdict making a claim
// about work it never examined. Every signature checks out. So the binding is
// followed all the way down — checkpoint → verdict → contract → **taskId** —
// and a verdict whose contract names a different task is FAILED, not
// NOT_CHECKED. That is not a gap in the evidence; it is evidence of a mismatch.

import { sign, verify, type Did } from './did';
import {
  verifyVerdict,
  type Outcome,
  type Verdict,
  type WorkContract,
} from './work-contract';

export const HANDOFF_DOMAIN = 'zkrepid:handoff:v1';

/** Escape, never a raw byte. Two have landed in this repo and both were found by scan. */
const FIELD_SEP = '\u001f';
const SUB_SEP = '\u001e';

/** Weakest of two claims. VERIFIED asserts most, so it is what a gap revokes. */
function weaker(a: Outcome, b: Outcome): Outcome {
  const rank: Record<Outcome, number> = { FAILED: 0, NOT_CHECKED: 1, VERIFIED: 2 };
  return rank[a] <= rank[b] ? a : b;
}

/**
 * One thing the session claims to have established.
 *
 * `outcome` is what the handing-off agent ASSERTS. It is a ceiling request, not
 * a verdict — exactly as `TypedHandoff.outcome` is inside the loop. The
 * difference is that here the ceiling is set by evidence the reader can open
 * rather than by events the reader has to trust.
 */
export interface Checkpoint {
  id: string;
  /** What is claimed to hold. Prose, for a human; the references are what bind. */
  statement: string;
  outcome: Outcome;
  /**
   * The verdict backing a VERIFIED claim.
   *
   * Absent is legal and common — a NOT_CHECKED or FAILED checkpoint has nothing
   * to cite. Absent on a VERIFIED claim is what gets it capped.
   */
  verdictHash?: string;
  /** The contract the verdict answered. Both are needed to detect a splice. */
  contractHash?: string;
  /** Who judged. Capped when this is the agent handing off. */
  checkerDid?: Did;
  detail: string;
}

/**
 * Something that did not work, carried forward on purpose.
 *
 * A rejected attempt is EVIDENCE, not progress, and evidence is worth more to
 * the next session than to this one — it is the only thing that stops session 2
 * spending its budget rediscovering what session 1 already ruled out. A handoff
 * format with nowhere to put failure quietly teaches every agent to omit it.
 */
export interface FailureRecord {
  what: string;
  /** What was observed. The reason this is not just a list of regrets. */
  evidence: string;
  at: string;
}

export interface UnsignedHandoff {
  version: typeof HANDOFF_DOMAIN;
  /** Binds every checkpoint's evidence to one task. The anti-splice anchor. */
  taskId: string;
  goal: string;
  checkpoints: readonly Checkpoint[];
  failures: readonly FailureRecord[];
  /**
   * Hash of the handoff this one continues, when there is one.
   *
   * Makes the chain explicit rather than implied by timestamps. A chain that
   * has to be reconstructed from clocks is a chain a reordering can rewrite.
   */
  previousHandoffHash?: string;
  /** The agent handing off. Checked against each checkpoint's checker. */
  agentDid: Did;
  endedAt: string;
}

export interface Handoff extends UnsignedHandoff {
  signature: string;
}

function refuseSeparators(where: string, value: string): void {
  if (value.includes('|') || value.includes(FIELD_SEP) || value.includes(SUB_SEP)) {
    throw new Error(
      `${where} contains a field separator ('|', U+001F or U+001E) and is refused. ` +
        'Separators inside a field let two different handoffs encode identically, so one ' +
        'signature would cover both.'
    );
  }
}

/**
 * Canonical encoding. Field by field, in order, never `JSON.stringify`.
 *
 * Checkpoints and failures are encoded IN ORDER and in full. A summary line
 * would be smaller and would let the contents change under a stable signature,
 * which is the entire property this artifact exists to have.
 */
export function handoffPayload(h: UnsignedHandoff): string {
  const checkpoints = h.checkpoints
    .map((c) =>
      [c.id, c.statement, c.outcome, c.verdictHash ?? '', c.contractHash ?? '', c.checkerDid ?? ''].join(SUB_SEP)
    )
    .join(FIELD_SEP);
  const failures = h.failures.map((f) => [f.what, f.evidence, f.at].join(SUB_SEP)).join(FIELD_SEP);
  return [
    HANDOFF_DOMAIN,
    h.taskId,
    h.goal,
    String(h.checkpoints.length),
    checkpoints,
    String(h.failures.length),
    failures,
    h.previousHandoffHash ?? '',
    h.agentDid,
    h.endedAt,
  ].join('|');
}

function assertHandoffSane(h: UnsignedHandoff): void {
  refuseSeparators('taskId', h.taskId);
  refuseSeparators('goal', h.goal);
  refuseSeparators('agentDid', h.agentDid);
  const seen = new Set<string>();
  for (const c of h.checkpoints) {
    refuseSeparators(`checkpoint id '${c.id}'`, c.id);
    refuseSeparators(`checkpoint '${c.id}' statement`, c.statement);
    if (seen.has(c.id)) {
      throw new Error(
        `checkpoint id '${c.id}' appears twice. Duplicate ids make it ambiguous which claim ` +
          'a reader is evaluating, and the ambiguity resolves differently per reader.'
      );
    }
    seen.add(c.id);
  }
  for (const f of h.failures) {
    refuseSeparators('failure description', f.what);
    refuseSeparators('failure evidence', f.evidence);
  }
}

export async function signHandoff(input: {
  unsigned: UnsignedHandoff;
  agentKey: CryptoKey;
}): Promise<Handoff> {
  assertHandoffSane(input.unsigned);
  return {
    ...input.unsigned,
    signature: await sign(input.agentKey, handoffPayload(input.unsigned)),
  };
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export type CheckpointCapReason =
  /** Claimed VERIFIED with no verdict cited. */
  | 'no_evidence_cited'
  /** Cited a verdict the reader was not given. Honest handoffs land here. */
  | 'evidence_not_supplied'
  /** The supplied verdict is broken — bad signature, or not bound to its contract. */
  | 'evidence_invalid'
  /**
   * The supplied verdict is SOUND and it says the work did not pass.
   *
   * Split out from `evidence_invalid` 2026-08-15 after measuring that the two
   * were indistinguishable: same cap reason AND same effective outcome, so no
   * field separated them. They are not the same fact. A corrupt citation may be
   * transport or a bug. **A sound verdict from an independent checker saying
   * FAILED, handed off as a VERIFIED checkpoint, is the agent contradicting
   * evidence in its own hands** — the sharpest instance of the transitive claim
   * inflation this file's header says it exists to close, and the one a reader
   * most needs to see.
   *
   * This applies the rule the file already states for `wrong_task`: *not a gap
   * in the evidence, but evidence of a mismatch.* The rule was written and then
   * applied in one branch out of two.
   */
  | 'contradicted_by_evidence'
  /** The verdict's contract names a different task. A splice. */
  | 'wrong_task'
  /** The cited hashes do not match the supplied evidence. */
  | 'hash_mismatch'
  /** The checker is the agent handing off. */
  | 'self_certified';

export interface CheckpointVerification {
  id: string;
  /** What the handoff asserted. */
  claimed: Outcome;
  /** What a reader is entitled to believe. Never stronger than `claimed`. */
  effective: Outcome;
  /** Set when `effective` is weaker than `claimed`. */
  capReason?: CheckpointCapReason;
  detail: string;
}

export interface HandoffVerification {
  outcome: Outcome;
  signatureValid: boolean;
  /** Whether the chain link matched, when one was claimed and a previous supplied. */
  chainIntact: boolean | null;
  checkpoints: readonly CheckpointVerification[];
  handoffHash: string;
  detail: string;
}

export interface VerifyHandoffInput {
  handoff: Handoff;
  /**
   * The evidence, keyed by verdict hash.
   *
   * OPTIONAL, and its absence is the normal case for a reader who received only
   * the handoff. Every VERIFIED checkpoint then caps to NOT_CHECKED, which is
   * the honest reading: the claims may be true and this reader cannot tell.
   */
  evidence?: ReadonlyMap<string, { verdict: Verdict; contract: WorkContract }>;
  /** The handoff this one claims to continue, for the chain check. */
  previous?: Handoff;
}

/**
 * Verify a handoff, returning what a reader is entitled to believe.
 *
 * The effective outcome of every checkpoint is the WEAKER of what was claimed
 * and what the evidence supports. It never strengthens: a reader who supplies a
 * VERIFIED verdict for a checkpoint the handoff itself marked FAILED still sees
 * FAILED, because the agent that did the work saying it failed is information
 * the evidence does not override.
 */
export async function verifyHandoff(input: VerifyHandoffInput): Promise<HandoffVerification> {
  const { handoff, evidence, previous } = input;

  let payload: string;
  try {
    assertHandoffSane(handoff);
    payload = handoffPayload(handoff);
  } catch (e) {
    return {
      outcome: 'NOT_CHECKED',
      signatureValid: false,
      chainIntact: null,
      checkpoints: [],
      handoffHash: '',
      detail: `the handoff could not be canonically encoded, so nothing was checked: ${(e as Error).message}`,
    };
  }

  const [signatureValid, handoffHash] = await Promise.all([
    verify(handoff.agentDid, payload, handoff.signature),
    hashPayload(payload),
  ]);

  // Chain. `null` is a third state and it matters: no previous was supplied, so
  // the link was not examined. Reporting `false` would allege a broken chain
  // that may be perfectly intact.
  let chainIntact: boolean | null = null;
  if (previous !== undefined) {
    const previousHash = await hashPayload(handoffPayload(previous));
    chainIntact = handoff.previousHandoffHash === previousHash;
  }

  const checkpoints: CheckpointVerification[] = [];
  for (const checkpoint of handoff.checkpoints) {
    checkpoints.push(await verifyCheckpoint(checkpoint, handoff, evidence));
  }

  // A broken signature invalidates the whole artifact: the checkpoints are no
  // longer known to be the ones the agent signed, so their outcomes describe a
  // document nobody wrote.
  if (!signatureValid) {
    return {
      outcome: 'FAILED',
      signatureValid: false,
      chainIntact,
      checkpoints: checkpoints.map((c) => ({
        ...c,
        effective: 'FAILED',
        capReason: 'evidence_invalid',
        detail: 'the handoff signature does not verify, so this checkpoint was not signed as written',
      })),
      handoffHash,
      detail: `the handoff signature does not verify against ${handoff.agentDid}`,
    };
  }

  if (chainIntact === false) {
    return {
      outcome: 'FAILED',
      signatureValid: true,
      chainIntact: false,
      checkpoints,
      handoffHash,
      detail:
        'the handoff names a previous handoff hash that does not match the one supplied — ' +
        'the chain has been rewritten or the wrong predecessor was provided',
    };
  }

  let outcome: Outcome = 'VERIFIED';
  for (const c of checkpoints) outcome = weaker(outcome, c.effective);
  if (checkpoints.length === 0) {
    // Nothing claimed is not the same as everything verified. A handoff with no
    // checkpoints has established nothing, however clean it looks.
    outcome = 'NOT_CHECKED';
  }

  const capped = checkpoints.filter((c) => c.effective !== c.claimed);
  return {
    outcome,
    signatureValid: true,
    chainIntact,
    checkpoints,
    handoffHash,
    detail:
      capped.length === 0
        ? `${handoff.agentDid} signed this handoff; all ${checkpoints.length} checkpoint(s) stand as claimed`
        : `${handoff.agentDid} signed this handoff; ${capped.length} of ${checkpoints.length} ` +
          `checkpoint(s) were reduced: ${capped.map((c) => `'${c.id}' ${c.claimed}->${c.effective} (${c.capReason})`).join(', ')}`,
  };
}

async function verifyCheckpoint(
  checkpoint: Checkpoint,
  handoff: Handoff,
  evidence: VerifyHandoffInput['evidence']
): Promise<CheckpointVerification> {
  const base = { id: checkpoint.id, claimed: checkpoint.outcome };

  // Only a VERIFIED claim needs backing. NOT_CHECKED and FAILED assert nothing
  // a reader could be misled by — and demanding evidence for them would create
  // an incentive to report neither, which is how failure disappears from a
  // record.
  if (checkpoint.outcome !== 'VERIFIED') {
    return {
      ...base,
      effective: checkpoint.outcome,
      detail: `claimed ${checkpoint.outcome}, which asserts nothing requiring evidence`,
    };
  }

  // SELF-CERTIFICATION, checked before anything else because it is the one
  // failure that a perfectly valid verdict still exhibits.
  if (checkpoint.checkerDid && checkpoint.checkerDid.trim() === handoff.agentDid.trim()) {
    return {
      ...base,
      effective: 'NOT_CHECKED',
      capReason: 'self_certified',
      detail:
        `the checkpoint was judged by ${checkpoint.checkerDid}, which is the agent handing off. ` +
        'An agent vouching for its own work across a session boundary is the same ' +
        'self-certification, with a night in between.',
    };
  }

  if (!checkpoint.verdictHash || !checkpoint.contractHash) {
    return {
      ...base,
      effective: 'NOT_CHECKED',
      capReason: 'no_evidence_cited',
      detail:
        'claimed VERIFIED but cites no verdict and contract, so there is nothing a reader ' +
        'could open. An unbacked VERIFIED is an assertion, not a checkpoint.',
    };
  }

  const supplied = evidence?.get(checkpoint.verdictHash);
  if (!supplied) {
    return {
      ...base,
      effective: 'NOT_CHECKED',
      capReason: 'evidence_not_supplied',
      detail:
        `cites verdict ${checkpoint.verdictHash} which was not supplied to this reader. ` +
        'The claim may be true; a hash is a commitment, and a commitment that cannot be ' +
        'opened is indistinguishable from one that opens to nothing.',
    };
  }

  const verification = await verifyVerdict({ verdict: supplied.verdict, contract: supplied.contract });

  // THE SPLICE. A genuinely signed verdict about a different task, cited here.
  // FAILED rather than NOT_CHECKED: this is not a gap in the evidence, it is
  // evidence of a mismatch, and the two must not read the same.
  if (supplied.contract.taskId !== handoff.taskId) {
    return {
      ...base,
      effective: 'FAILED',
      capReason: 'wrong_task',
      detail:
        `the cited verdict answers a contract for task '${supplied.contract.taskId}', but this ` +
        `handoff is for '${handoff.taskId}'. A valid verdict about other work is a forgery when ` +
        'presented as a checkpoint of this one.',
    };
  }

  if (verification.verdictHash !== checkpoint.verdictHash) {
    return {
      ...base,
      effective: 'FAILED',
      capReason: 'hash_mismatch',
      detail: 'the supplied verdict does not hash to the value this checkpoint cites',
    };
  }
  if (supplied.verdict.contractHash !== checkpoint.contractHash) {
    return {
      ...base,
      effective: 'FAILED',
      capReason: 'hash_mismatch',
      detail: 'the supplied verdict names a different contract than this checkpoint cites',
    };
  }

  if (verification.outcome !== 'VERIFIED') {
    // THE CITATION IS SOUND, SO WHAT IT SAYS IS THE AGENT'S OWN EVIDENCE.
    // `signatureValid` and `boundToContract` were already computed and already
    // returned; collapsing them into one cap reason threw away the only thing
    // that separates a broken citation from an overclaim.
    const sound = verification.signatureValid && verification.boundToContract;
    return {
      ...base,
      effective: weaker('VERIFIED', verification.outcome),
      capReason: sound ? 'contradicted_by_evidence' : 'evidence_invalid',
      detail: sound
        ? `the cited verdict is sound and reports ${verification.outcome}: ${verification.detail}. ` +
          'The checkpoint claimed VERIFIED against evidence the agent was holding that says ' +
          'otherwise — this is an overclaim, not a gap.'
        : `the cited verdict does not verify as VERIFIED: ${verification.detail}`,
    };
  }

  // The checker named on the verdict must also be the one the checkpoint
  // claims, or the checkpoint's self-certification check was answered about
  // somebody else.
  if (checkpoint.checkerDid && checkpoint.checkerDid.trim() !== supplied.verdict.checkerDid.trim()) {
    return {
      ...base,
      effective: 'FAILED',
      capReason: 'hash_mismatch',
      detail:
        `the checkpoint names ${checkpoint.checkerDid} as checker but the verdict was signed by ` +
        `${supplied.verdict.checkerDid}`,
    };
  }
  // And the real checker must still not be the handing-off agent, even when the
  // checkpoint declined to name one.
  if (supplied.verdict.checkerDid.trim() === handoff.agentDid.trim()) {
    return {
      ...base,
      effective: 'NOT_CHECKED',
      capReason: 'self_certified',
      detail: `the cited verdict was signed by ${handoff.agentDid}, the agent handing off`,
    };
  }

  return {
    ...base,
    effective: 'VERIFIED',
    detail: `backed by a verdict from ${supplied.verdict.checkerDid} against the agreed contract`,
  };
}

async function hashPayload(payload: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return (
    'sha256:' +
    Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  );
}
