// assigned-contract.ts — a contract the doer signs but did not compose.
//
// ── THE FIX THAT NEEDED NO WIRE CHANGE ───────────────────────────────────────
//
// `docs/ORNITH-ASSESSMENT-2026-08-15.md` §2.2 named checker shopping and listed
// three candidate fixes, judging the cheapest one — recording who selected the
// checker — to require a change to `contractPayload`, a signed canonical
// encoding already handed to the other lane. That framing was too pessimistic
// and this module is the correction.
//
// **`proposeContract` takes the unsigned contract as an INPUT.** Nothing in
// `work-contract.ts` says the doer must be the thing that built it. Move the
// construction to an assigner and the doer signs a contract whose checker and
// criteria were both drawn — same bytes, same payload, same interop spec,
// **zero cross-lane decision required.**
//
// The lever was never the format. It was who calls the constructor.
//
// ── ONE COMMITMENT, ONE BEACON, TWO DRAWS ────────────────────────────────────
//
// The checker and the criteria come from the same `requestCommitment` and the
// same beacon. That is not tidiness: two independent draws would be two
// chances, and a doer that could re-request one of them would keep the exam it
// liked and re-roll the judge, or the reverse.
//
// The commitment binds the BANK, not the criteria — the criteria do not exist
// yet when it is made. So the doer commits to *the syllabus it will be examined
// from* before the beacon exists, which is the strongest form of the ordering
// argument available: it cannot know the questions because they have not been
// drawn, and it cannot grind the bank because the beacon is not yet public.
//
// ── WHAT THIS STILL DOES NOT FIX ─────────────────────────────────────────────
//
// Three inputs remain outside the mechanism, and every one of them can make a
// perfectly verifying assembly meaningless:
//
//   * WHO SUPPLIED THE BEACON. A self-chosen beacon reproduces fine.
//   * WHO WROTE THE BANK. A doer-authored syllabus is its own exam.
//   * WHO MAINTAINS THE PANEL. A pool of the doer's friends passes every check
//     here, because each of them genuinely is not the doer.
//
// They are stated in the verification detail rather than hidden behind a green
// outcome. A mechanism that cannot see its own preconditions must say so, or it
// launders them.

import type { Did } from './did';
import {
  assignChecker,
  commitAssignmentRequest,
  commitPool,
  eligiblePool,
  verifyAssignment,
  type AssignmentProof,
  type CheckerCandidate,
  type QualificationRequirement,
} from './checker-assignment';
import {
  commitBank,
  drawCriteria,
  verifyDraw,
  type BankCriterion,
  type CriteriaDrawProof,
} from './criteria-draw';
import { CONTRACT_DOMAIN, type ContractCriterion, type UnsignedContract } from './work-contract';

export interface AssignedContract {
  /** Ready for `proposeContract`. The doer signs it; it did not build it. */
  unsigned: UnsignedContract;
  assignment: AssignmentProof;
  criteriaProof: CriteriaDrawProof;
  /** Who was filtered out of the panel and why. Auditable rather than silent. */
  excluded: readonly { did: Did; reason: string }[];
}

/**
 * Draw the checker and the exam, then compose the contract.
 *
 * The doer's only inputs are the task it wants done and the nonce; it does not
 * choose the checker, the criteria, or the order they are drawn in.
 */
export async function assembleAssignedContract(input: {
  taskId: string;
  doerDid: Did;
  deliverable: string;
  requirement: QualificationRequirement;
  nonce: string;
  /** Public randomness. See the header — its provenance is not checked here. */
  beacon: string;
  candidates: readonly CheckerCandidate[];
  bank: readonly BankCriterion[];
  criteriaCount: number;
  proposedAt: string;
}): Promise<AssignedContract> {
  const { pool, excluded } = eligiblePool({
    candidates: input.candidates,
    requirement: input.requirement,
    doerDid: input.doerDid,
  });

  // The commitment binds the BANK, because the criteria do not exist yet.
  const bankCommitment = await commitBank(input.bank);
  const requestCommitment = await commitAssignmentRequest({
    taskId: input.taskId,
    doerDid: input.doerDid,
    criteriaHash: bankCommitment,
    requirement: input.requirement,
    nonce: input.nonce,
  });

  const assignment = await assignChecker({ requestCommitment, beacon: input.beacon, pool });
  const criteriaProof = await drawCriteria({
    requestCommitment,
    beacon: input.beacon,
    bank: input.bank,
    count: input.criteriaCount,
  });

  const criteria: ContractCriterion[] = criteriaProof.criteria.map((c) => ({
    id: c.id,
    statement: c.statement,
    ...(c.minScore === undefined ? {} : { minScore: c.minScore }),
  }));

  return {
    unsigned: {
      version: CONTRACT_DOMAIN,
      taskId: input.taskId,
      deliverable: input.deliverable,
      criteria,
      doerDid: input.doerDid,
      checkerDid: assignment.checkerDid,
      proposedAt: input.proposedAt,
    },
    assignment,
    criteriaProof,
    excluded,
  };
}

export interface AssignedContractVerification {
  outcome: 'VERIFIED' | 'NOT_CHECKED' | 'FAILED';
  /** The checker in the contract is the one the draw produced. */
  checkerWasDrawn: boolean;
  /** The criteria in the contract are the ones the draw produced. */
  criteriaWereDrawn: boolean;
  /** Both draws share one commitment and one beacon. */
  singleDraw: boolean;
  detail: string;
}

/**
 * Confirm a contract was assembled from the draws it claims.
 *
 * THE CHECK THAT MATTERS is not that the proofs verify — they verify on their
 * own — but that **the contract matches them**. A valid assignment proof
 * stapled to a contract naming somebody else is the whole attack, and it is the
 * one a reader is most likely to skip.
 */
export async function verifyAssignedContract(input: {
  unsigned: UnsignedContract;
  assignment: AssignmentProof;
  criteriaProof: CriteriaDrawProof;
  pool: readonly CheckerCandidate[];
  bank: readonly BankCriterion[];
}): Promise<AssignedContractVerification> {
  const { unsigned, assignment, criteriaProof, pool, bank } = input;

  const [a, c] = await Promise.all([
    verifyAssignment({ proof: assignment, pool }),
    verifyDraw({ proof: criteriaProof, bank }),
  ]);

  if (a.outcome === 'NOT_CHECKED' || c.outcome === 'NOT_CHECKED') {
    return {
      outcome: 'NOT_CHECKED',
      checkerWasDrawn: false,
      criteriaWereDrawn: false,
      singleDraw: false,
      detail: `a draw could not be read: ${a.detail}; ${c.detail}`,
    };
  }

  // ONE COMMITMENT, ONE BEACON. Two draws from different requests or different
  // beacons means somebody re-rolled one of them.
  const singleDraw =
    assignment.requestCommitment === criteriaProof.requestCommitment &&
    assignment.beacon === criteriaProof.beacon;

  const checkerWasDrawn =
    a.outcome === 'VERIFIED' && unsigned.checkerDid.trim() === assignment.checkerDid.trim();

  const drawn = criteriaProof.criteria.map((x) => ({
    id: x.id,
    statement: x.statement,
    ...(x.minScore === undefined ? {} : { minScore: x.minScore }),
  }));
  const criteriaWereDrawn =
    c.outcome === 'VERIFIED' && JSON.stringify(unsigned.criteria) === JSON.stringify(drawn);

  if (!singleDraw || !checkerWasDrawn || !criteriaWereDrawn) {
    const why = [
      singleDraw ? null : 'the two draws do not share one commitment and beacon — one was re-rolled',
      checkerWasDrawn
        ? null
        : `the contract names ${unsigned.checkerDid} but the draw produced ${assignment.checkerDid}`,
      criteriaWereDrawn ? null : 'the contract criteria are not the ones drawn',
    ].filter(Boolean);
    return {
      outcome: 'FAILED',
      checkerWasDrawn,
      criteriaWereDrawn,
      singleDraw,
      detail: `this contract was not assembled from these draws: ${why.join('; ')}`,
    };
  }

  return {
    outcome: 'VERIFIED',
    checkerWasDrawn: true,
    criteriaWereDrawn: true,
    singleDraw: true,
    detail:
      `${unsigned.doerDid} signs a contract it did not compose: checker drawn from ${pool.length} ` +
      `qualified candidates, ${unsigned.criteria.length} of ${bank.length} criteria drawn, one beacon. ` +
      'NOT CHECKED: who supplied the beacon, who wrote the bank, who maintains the panel — ' +
      'any of the three can make this assembly meaningless.',
  };
}
