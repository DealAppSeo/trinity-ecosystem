// lib/trustshell/identity/spine.ts
//
// The whole verification spine as ONE callable function.
//
// WHY THIS FILE EXISTS. Every link in the chain below was built, tested and
// mutation-proven — and then imported by nothing. Measured 2026-08-16 on
// `origin/main` at 3a0890b: `assigned-contract`, `staged-judge`,
// `verdict-envelope`, `outcome-to-reputation`, `auditor-grant` and `handoff`
// each had ZERO importers in `lib/` + `app/`, and not one of the ten spine
// modules was exported from `lib/trustshell/index.ts`. `runAgentLoop` WAS
// exported. So the package shipped a kernel with an open Evaluator port and
// shipped nothing that could fill it: a consumer could start a loop and had no
// reachable way to have its work judged.
//
// The composition was not missing. It existed, in `scripts/spine-e2e-test.mjs`,
// as ~40 lines of hand-assembly — which is exactly why the library had no
// callers. A test that assembles the product is the product's only user. This
// file promotes that assembly to shipped code, and the E2E suite now calls THIS
// rather than rebuilding it, so the tested path and the shipped path are the
// same path by construction.
//
// WHAT IT DOES NOT DO. It adds no mechanism, no policy and no new signed byte.
// Every guarantee here is one the underlying modules already made; this is
// wiring, deliberately. `contractPayload` is untouched, so there is no
// cross-lane interop decision in this file.
//
// THREE THINGS IT MAKES LOUD. The modules return honest values that a caller
// hand-assembling the chain can silently ignore. Composition is where those
// become refusals, because these three are conditions under which continuing
// produces a *plausible* artifact that is not what it appears to be:
//
//   1. an assembly that does not verify — nobody should sign a draw they
//      cannot check;
//   2. a drawn checker this harness cannot act as — otherwise the natural
//      repair is to pick a checker it CAN act as, which is checker-shopping
//      reintroduced as an error-handling convenience;
//   3. doer === checker, re-asserted here as defence in depth. It is already
//      enforced in `eligiblePool` and by the kernel; a constitutional invariant
//      should not rest on one call site.

import type { Did } from './did';
import {
  proposeContract,
  countersignContract,
  verifyVerdict,
  type WorkContract,
  type Verdict,
  type VerdictVerification,
} from './work-contract';
import {
  assembleAssignedContract,
  verifyAssignedContract,
  type AssignedContract,
  type AssignedContractVerification,
} from './assigned-contract';
import { eligiblePool } from './checker-assignment';
import { createStagedJudge, type JudgeTier } from './staged-judge';
import {
  createContractedEvaluator,
  type ContractedEvaluation,
} from './contracted-evaluator';
import { packEnvelope, type TrustEnvelope } from './verdict-envelope';
import {
  reputationForVerdict,
  type ReputationOutcome,
  type VerdictReputationInput,
} from './outcome-to-reputation';
import {
  runAgentLoop,
  type RunAgentLoopInput,
  type LoopResult,
} from '../harness/loop';

/**
 * Derived from the assigner rather than restated, so this file cannot drift
 * from the module that actually draws the checker and the exam.
 */
export type AssignmentInput = Parameters<typeof assembleAssignedContract>[0];

export interface ContractedWorkInput {
  /** Everything the assigner needs to draw a checker and an exam. */
  assignment: AssignmentInput;
  /** The doer's signing key. It signs a contract it did not compose. */
  doerKey: CryptoKey;
  /**
   * Resolve the DRAWN checker's signing key.
   *
   * Returning `undefined` throws. See the header: quietly falling back to a
   * checker this harness can act as is checker-shopping wearing an error
   * handler.
   */
  checkerKeyFor: (did: Did) => CryptoKey | undefined;
  /** Judge tiers, cheapest first. FAILED and referrals are final; see staged-judge. */
  tiers: readonly JudgeTier[];
  /**
   * The loop inputs this function does not derive.
   *
   * `evaluator`, `criteria`, `doerDid` and `taskId` are omitted because the
   * CONTRACT supplies them. A caller that could pass its own `criteria` here
   * could run against criteria the contract never agreed, which is the
   * re-scoping attack arriving as a parameter.
   */
  execution: Omit<
    RunAgentLoopInput,
    'evaluator' | 'criteria' | 'doerDid' | 'taskId'
  >;
  /** Injected so the verdict's timestamp is not an ambient dependency. */
  now?: () => Date;
  /** When reputation was computed. Required — an unstamped observation is unauditable. */
  observedAt: string;
  /**
   * A later, independent answer about the same work.
   *
   * ABSENT IS THE COMMON CASE. Without it the checker earns nothing, which is
   * correct: see `outcome-to-reputation` and TRUST-HARNESS-DESIGN §4.1, where
   * the ground-truth oracle is NAMED, not solved.
   */
  observation?: VerdictReputationInput['observation'];
}

export interface ContractedWorkResult {
  assigned: AssignedContract;
  /** The draw, checked before anyone signed it. */
  assemblyVerification: AssignedContractVerification;
  contract: WorkContract;
  loop: LoopResult;
  /**
   * Absent when the evaluator produced no signed verdict — a judge outage
   * reaches here as NOT_CHECKED, and absent is the honest representation of
   * "nothing was signed" rather than a forged empty verdict.
   */
  verdict?: Verdict;
  verdictVerification?: VerdictVerification;
  /** Absent whenever `verdict` is. Requires a verdict to wrap. */
  envelope?: TrustEnvelope;
  /**
   * Absent whenever `verdict` is. Note that PRESENT-but-empty `events` is the
   * normal case: most verdicts justify no reputation movement at all, and
   * `withheld` says why.
   */
  reputation?: ReputationOutcome;
}

/**
 * Draw a checker and an exam, have the doer sign a contract it did not compose,
 * run the bounded loop under an independent contracted evaluator, and produce a
 * portable envelope a stranger can verify offline.
 *
 * This is the loop of TRUST-HARNESS-DESIGN §2 — contract → generate → audit →
 * commit — with the evidence-vs-progress split of §5 step 5 attached at the
 * end.
 */
export async function runContractedWork(
  input: ContractedWorkInput
): Promise<ContractedWorkResult> {
  const { assignment, doerKey, checkerKeyFor, tiers, execution } = input;

  // 1. The assigner draws. The doer chose neither the judge nor the test.
  const assigned = await assembleAssignedContract(assignment);

  // 2. Check the draw BEFORE anyone signs it. Both proofs verifying is not
  //    enough on its own — the contract has to be compared TO them, which is
  //    the step a reader skips (see assigned-contract's own header).
  const { pool } = eligiblePool({
    candidates: assignment.candidates,
    requirement: assignment.requirement,
    doerDid: assignment.doerDid,
  });
  const assemblyVerification = await verifyAssignedContract({
    unsigned: assigned.unsigned,
    assignment: assigned.assignment,
    criteriaProof: assigned.criteriaProof,
    pool,
    bank: assignment.bank,
  });
  if (assemblyVerification.outcome !== 'VERIFIED') {
    throw new Error(
      `refusing to sign an assignment that does not verify: ${assemblyVerification.detail}`
    );
  }

  // 3. Defence in depth. Already enforced in `eligiblePool` and by the kernel;
  //    a constitutional invariant should not rest on one call site.
  if (assigned.unsigned.checkerDid === assignment.doerDid) {
    throw new Error(
      'checker_must_not_be_doer: the drawn checker is the doer. This is ' +
        'constitutional and no setting may relax it.'
    );
  }

  const checkerKey = checkerKeyFor(assigned.unsigned.checkerDid);
  if (!checkerKey) {
    throw new Error(
      `no signing key for the drawn checker ${assigned.unsigned.checkerDid}. ` +
        'Refusing to continue: substituting a checker this harness CAN act as ' +
        'would let the doer reach a judge of convenience, which is exactly ' +
        'what the draw exists to prevent.'
    );
  }

  // 4. The doer signs a contract it did not build.
  const { doerSignature } = await proposeContract({
    unsigned: assigned.unsigned,
    doerKey,
  });
  const contract = await countersignContract({
    unsigned: assigned.unsigned,
    doerSignature,
    checkerKey,
  });

  // 5. Cheap tiers first. FAILED is final; VERIFIED escalates.
  const staged = createStagedJudge({ tiers });
  const evaluator = createContractedEvaluator({
    contract,
    checkerKey,
    judge: staged.judge,
    now: input.now,
  });

  // 6. The bounded loop, judged by someone the doer did not choose. The
  //    contract supplies criteria/doerDid/taskId — not the caller.
  const loop = await runAgentLoop({
    ...execution,
    taskId: assignment.taskId,
    doerDid: assignment.doerDid,
    criteria: assigned.unsigned.criteria,
    evaluator,
  });

  // `Evaluation` is the kernel's port type and carries no `verdict`; the
  // contracted evaluator returns the wider `ContractedEvaluation`. Narrowed
  // here rather than widening the kernel port, which would drag a signing
  // concern into a module that must not have one.
  const evaluation = loop.evaluation?.evaluation as
    | ContractedEvaluation
    | undefined;
  const verdict = evaluation?.verdict;

  if (!verdict) {
    return { assigned, assemblyVerification, contract, loop };
  }

  const verdictVerification = await verifyVerdict({ verdict, contract });
  const envelope = await packEnvelope({ contract, verdict });
  const reputation = reputationForVerdict({
    verdict,
    verification: verdictVerification,
    verdictHash: verdictVerification.verdictHash,
    doerDid: assignment.doerDid,
    observation: input.observation,
    observedAt: input.observedAt,
  });

  return {
    assigned,
    assemblyVerification,
    contract,
    loop,
    verdict,
    verdictVerification,
    envelope,
    reputation,
  };
}
