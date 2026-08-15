// criteria-draw.ts — the examinee may not pick the test either.
//
// ── THE OTHER HALF ───────────────────────────────────────────────────────────
//
// `checker-assignment.ts` stops the doer choosing its judge. This stops it
// choosing its exam. Both halves are needed and neither substitutes for the
// other: an agent that cannot pick the judge but writes the criteria has simply
// moved the lever, and a signed contract binds it to a test it authored.
//
// Today `proposeContract` is called by the doer with `criteria` already in the
// unsigned contract. The checker countersigns, so it consents — but the doer
// drafted the paper. That is the same shape as checker shopping, one field
// across.
//
// ── WHAT IS AND IS NOT SECRET ────────────────────────────────────────────────
//
// **The criteria are NOT hidden from the doer, and hiding them would be wrong.**
// The whole value of a pre-execution contract is that both parties know the bar
// before the work starts; a secret exam would make the contract unsignable and
// the work unaimable. The property being defended is not secrecy, it is
// **non-selection**: the doer learns the criteria at contract time and did not
// choose which ones they are.
//
// This is where the appraisal analogy stops and the exam-board one begins. An
// appraiser is drawn because the examinee must not know who; exam questions are
// drawn from a published syllabus because the examinee must not choose which.
// Same mechanism, different reason, and the reason changes what you optimise:
// there is no argument here for keeping the bank small or private.
//
// ── WHO WRITES THE BANK ──────────────────────────────────────────────────────
//
// **Not the doer.** If the doer authors the bank, this whole module is
// decoration: every criterion is one it wrote, and drawing five of its own
// twenty changes nothing. The bank belongs to the requester of the work — the
// principal — exactly as the checker panel belongs to whoever maintains it.
//
// That is a dependency this module CANNOT enforce and does not pretend to. It
// verifies that the criteria drawn are the ones the committed bank and the
// beacon produce. It cannot see who wrote the bank, and `verifyDraw` says so
// rather than implying otherwise — the same honest limit as beacon provenance
// in `checker-assignment.ts`.
//
// ── WITHOUT REPLACEMENT, WITHOUT BIAS ────────────────────────────────────────
//
// Drawing k of n needs care that drawing 1 of n does not. The naive loop —
// draw an index, discard it if already taken, try again — terminates but is
// slower as k approaches n, and worse, invites an implementation that silently
// caps its retries and returns a short list. This uses a **partial
// Fisher-Yates**: swap the chosen element to the front of the remaining range
// and shrink the range. Every subset of size k is equally likely, no retries
// exist to cap, and the draw is O(k).

import {
  SEP,
  TAG as ASSIGN_TAG,
  digestHex,
  refuseSeparator,
  uniformIndex,
} from './checker-assignment';

export const CRITERIA_DRAW_DOMAIN = 'zkrepid:criteria-draw:v1';

const TAG = {
  bank: `${CRITERIA_DRAW_DOMAIN}:bank`,
  seed: `${CRITERIA_DRAW_DOMAIN}:seed`,
} as const;

/** One criterion in the bank. Shape matches `ContractCriterion` on purpose. */
export interface BankCriterion {
  id: string;
  statement: string;
  /** Hard floor in [0, 1], carried through to the contract unchanged. */
  minScore?: number;
}

/**
 * Commit to the bank the draw ran over.
 *
 * Covers `minScore` as well as the statement: a bank whose floors can be
 * lowered after commitment is a bank that was never committed, and the floor is
 * the part a doer most wants moved.
 */
export async function commitBank(bank: readonly BankCriterion[]): Promise<string> {
  const fields = [TAG.bank, String(bank.length)];
  for (const c of bank) {
    fields.push(c.id, c.statement, c.minScore === undefined ? '' : String(c.minScore));
  }
  fields.forEach((f, i) => refuseSeparator(`bank field ${i}`, f));
  return `sha256:${await digestHex(fields.join(SEP))}`;
}

export interface CriteriaDrawProof {
  version: typeof CRITERIA_DRAW_DOMAIN;
  requestCommitment: string;
  beacon: string;
  bankCommitment: string;
  bankSize: number;
  drawCount: number;
  seed: string;
  /** Indices into the bank, in draw order. The order is part of the proof. */
  indices: readonly number[];
  /** The drawn criteria, for a reader who does not hold the bank. */
  criteria: readonly BankCriterion[];
}

/**
 * Draw `count` criteria from a committed bank.
 *
 * Shares the beacon with `assignChecker`, deliberately: one commitment and one
 * beacon fix both the judge and the exam, so a doer cannot accept the draw it
 * likes and re-request the other. Two independent draws would be two chances.
 */
export async function drawCriteria(input: {
  requestCommitment: string;
  beacon: string;
  bank: readonly BankCriterion[];
  count: number;
}): Promise<CriteriaDrawProof> {
  const { requestCommitment, beacon, bank, count } = input;

  if (beacon.trim() === '') {
    throw new Error(
      'refusing to draw criteria with an empty beacon — the doer would be choosing its ' +
        'own exam through a seed it controls, which is the attack this module exists to stop.'
    );
  }
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`refusing to draw ${count} criteria: a unit of work with no agreed bar is not judgeable`);
  }
  if (count > bank.length) {
    throw new Error(
      `refusing to draw ${count} criteria from a bank of ${bank.length}. Drawing the whole ` +
        'bank is not a draw — every criterion is selected, so the bank IS the exam and ' +
        'saying it was drawn would be false.'
    );
  }
  if (count === bank.length) {
    throw new Error(
      `refusing to draw all ${count} of ${bank.length}: the result is the bank itself, and ` +
        'reporting it as a draw would overstate what happened. Use the bank directly.'
    );
  }

  refuseSeparator('requestCommitment', requestCommitment);
  refuseSeparator('beacon', beacon);
  const bankCommitment = await commitBank(bank);
  const seed = `sha256:${await digestHex([TAG.seed, requestCommitment, beacon, bankCommitment, String(count)].join(SEP))}`;

  // Partial Fisher-Yates over an index list. No retries, no rejection of
  // already-drawn indices, every k-subset equally likely.
  const pool = bank.map((_, i) => i);
  const indices: number[] = [];
  for (let picked = 0; picked < count; picked += 1) {
    const remaining = pool.length - picked;
    const { index } = await uniformIndex(`${seed}${SEP}${picked}`, remaining);
    const chosen = picked + index;
    [pool[picked], pool[chosen]] = [pool[chosen], pool[picked]];
    indices.push(pool[picked]);
  }

  return {
    version: CRITERIA_DRAW_DOMAIN,
    requestCommitment,
    beacon,
    bankCommitment,
    bankSize: bank.length,
    drawCount: count,
    seed,
    indices,
    criteria: indices.map((i) => bank[i]),
  };
}

export interface CriteriaDrawVerification {
  outcome: 'VERIFIED' | 'NOT_CHECKED' | 'FAILED';
  drawReproduced: boolean;
  bankMatches: boolean;
  detail: string;
}

/**
 * Recompute the draw against the bank a verifier holds.
 *
 * WHAT THIS CANNOT TELL YOU: **who wrote the bank.** A doer that authored its
 * own syllabus produces a proof that verifies perfectly and means nothing,
 * exactly as a self-chosen beacon does in `checker-assignment.ts`. Bank
 * authorship is an input to this design, not an output of it.
 */
export async function verifyDraw(input: {
  proof: CriteriaDrawProof;
  bank: readonly BankCriterion[];
}): Promise<CriteriaDrawVerification> {
  const { proof, bank } = input;

  if (proof.version !== CRITERIA_DRAW_DOMAIN) {
    return {
      outcome: 'NOT_CHECKED',
      drawReproduced: false,
      bankMatches: false,
      detail: `unknown criteria-draw version ${JSON.stringify(proof.version)}`,
    };
  }

  const bankCommitment = await commitBank(bank);
  const bankMatches = bankCommitment === proof.bankCommitment && bank.length === proof.bankSize;
  if (!bankMatches) {
    return {
      outcome: 'FAILED',
      drawReproduced: false,
      bankMatches: false,
      detail:
        'the bank supplied is not the bank that was drawn from — an edited syllabus is how ' +
        'a chosen exam is made to look drawn',
    };
  }

  const expected = await drawCriteria({
    requestCommitment: proof.requestCommitment,
    beacon: proof.beacon,
    bank,
    count: proof.drawCount,
  }).catch(() => null);

  const reproduced =
    expected !== null &&
    expected.seed === proof.seed &&
    JSON.stringify(expected.indices) === JSON.stringify(proof.indices) &&
    JSON.stringify(expected.criteria) === JSON.stringify(proof.criteria);

  if (!reproduced) {
    return {
      outcome: 'FAILED',
      drawReproduced: false,
      bankMatches: true,
      detail: `the draw does not reproduce: this bank and beacon select ${JSON.stringify(expected?.indices ?? null)}, not ${JSON.stringify(proof.indices)}`,
    };
  }

  return {
    outcome: 'VERIFIED',
    drawReproduced: true,
    bankMatches: true,
    detail:
      `${proof.drawCount} of ${bank.length} criteria drawn at indices ${proof.indices.join(', ')} under this beacon. ` +
      'WHO WROTE THE BANK is NOT CHECKED here, and a self-authored bank makes this proof meaningless.',
  };
}

/** The tag namespace of the module this shares a beacon with. Kept for readers. */
export const SHARES_BEACON_WITH = ASSIGN_TAG.seed;
