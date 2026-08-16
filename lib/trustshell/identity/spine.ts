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
import {
  evaluateAcceptance,
  auditorIsStable,
  roundVerdictFor,
  isTerminal,
  DEFAULT_MAX_REJECTIONS,
  type Round,
  type AcceptancePolicy,
  type AcceptanceState,
} from './acceptance-loop';

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

// ─────────────────────────────────────────────────────────────────────────────
// The acceptance loop, wired.
//
// `runContractedWork` is ONE round. A professional review is not one round: it
// is send-it-back, get-it-improved, look-again, and only then sign off. This is
// that loop, and it adds no new signed byte — every guarantee below is one the
// underlying modules already made. Composition is again where honest return
// values become refusals.
//
// ── WHY THE DRAW IS REPEATED RATHER THAN HOISTED ─────────────────────────────
//
// The obvious implementation hoists the draw out of the round so the auditor is
// sticky by construction. This one calls `runContractedWork` per round with the
// SAME `assignment`, and then CHECKS stickiness with `auditorIsStable`.
//
// That is deliberate, and it is not belt-and-braces. `assembleAssignedContract`
// is deterministic in `H(requestCommitment ‖ beacon ‖ poolCommitment)`, so an
// identical assignment redraws the identical checker — stickiness is already a
// property of the inputs. What is NOT guaranteed is that the inputs stay
// identical. A beacon is a drand round or a block hash; a caller that passes
// "the current beacon" each round, which is the natural thing to write, silently
// re-draws and hands the doer a fresh auditor per revision. That is
// checker-shopping arriving through a parameter that looks like good hygiene.
//
// Hoisting the draw would make that caller's mistake invisible. Checking it
// makes the mistake an error naming the round it happened on. The invariant is
// enforced against what actually occurred, not assumed from what should have.
// ─────────────────────────────────────────────────────────────────────────────

/** What the caller is told before producing the next attempt. */
export interface AttemptContext {
  /** 0-based round index. */
  round: number;
  /** Every round so far, in order. */
  rounds: readonly Round[];
  /** The most recent rejection's stated reason, when there is one. */
  lastDetail?: string;
}

export interface AttemptSubmission {
  /** The loop inputs for this attempt. Same omissions as ContractedWorkInput. */
  execution: ContractedWorkInput['execution'];
  /**
   * Digest of exactly what is being submitted this round.
   *
   * Supplied by the caller because only it knows what the deliverable IS. A
   * digest this layer derived from `execution` would hash the instructions
   * rather than the artefact, and two different deliverables produced from one
   * prompt would collide — making a genuine revision look like a stall.
   */
  submissionDigest: string;
}

export interface AcceptedWorkInput extends Omit<ContractedWorkInput, 'execution'> {
  /** Defaults to DEFAULT_MAX_REJECTIONS. */
  policy?: AcceptancePolicy;
  /**
   * Produce the next attempt. Called once per round.
   *
   * A function rather than a list, because a revision is a RESPONSE: round two
   * exists to address what round one was told. Passing pre-built attempts would
   * describe a loop that cannot learn, which is the thing being built here.
   *
   * RETURN `null` WHEN THERE IS NOTHING FURTHER TO SUBMIT. The loop then stops
   * and returns the state as it stands — which will be non-terminal, normally
   * REVISE.
   *
   * This exists because the doer is not always in-process. Over HTTP the doer
   * is the caller: it submits, the auditor rejects, and the revision arrives in
   * a LATER request, possibly minutes later, possibly never. Without this the
   * only ways to model that are to block a request waiting for a party that is
   * not there, or to fabricate an attempt — and a fabricated attempt is judged
   * work the doer never did.
   *
   * A non-terminal return is therefore a legitimate, expected outcome, not a
   * failure: "we got as far as the evidence allows, and the ball is with the
   * doer."
   */
  attempt: (
    context: AttemptContext
  ) => Promise<AttemptSubmission | null> | AttemptSubmission | null;
}

export interface AcceptedWorkResult {
  state: AcceptanceState;
  rounds: readonly Round[];
  /** Full result per round, same order. Rejected attempts are kept as evidence. */
  attempts: readonly ContractedWorkResult[];
  /**
   * The attempt that was signed off.
   *
   * ABSENT unless `state.status === 'ACCEPTED'`. EXHAUSTED and STALLED leave
   * this undefined on purpose: there is no deliverable, and a caller reaching
   * for one gets `undefined` rather than the last rejected attempt dressed as a
   * result.
   */
  delivered?: ContractedWorkResult;
}

/**
 * Run rounds against ONE drawn auditor until it signs off, the budget is spent,
 * or the doer stops changing the work.
 *
 * Returns rather than throws on every non-accepted terminal state. EXHAUSTED
 * and STALLED are outcomes to escalate, not exceptions — and a throw would lose
 * `attempts`, which is the evidence a human needs to decide which it was.
 */
export async function runAcceptedWork(
  input: AcceptedWorkInput
): Promise<AcceptedWorkResult> {
  const policy = input.policy ?? { maxRejections: DEFAULT_MAX_REJECTIONS };
  const rounds: Round[] = [];
  const attempts: ContractedWorkResult[] = [];
  let state: AcceptanceState = { status: 'NOT_STARTED' };

  for (let index = 0; ; index += 1) {
    const previousRejection = [...rounds].reverse().find((r) => r.verdict === 'REJECTED');
    const submission = await input.attempt({
      round: index,
      rounds,
      lastDetail: previousRejection?.detail,
    });

    // The doer has nothing further to submit. Stop with the state as it stands
    // rather than fabricating a round — see `attempt`. `state` is whatever the
    // previous iteration computed, so an empty first call correctly leaves
    // NOT_STARTED.
    if (submission === null) break;

    const result = await runContractedWork({
      assignment: input.assignment,
      doerKey: input.doerKey,
      checkerKeyFor: input.checkerKeyFor,
      tiers: input.tiers,
      execution: submission.execution,
      now: input.now,
      observedAt: input.observedAt,
      observation: input.observation,
    });
    attempts.push(result);

    rounds.push({
      index,
      auditorDid: result.assigned.unsigned.checkerDid,
      submissionDigest: submission.submissionDigest,
      // `verdictVerification.outcome` is deliberately NOT passed — it folds in
      // criteriaOutcome, so a valid verdict that rejects the work reports
      // FAILED there and would be misread as unreadable. See roundVerdictFor.
      verdict: roundVerdictFor({
        hasVerdict: result.verdict !== undefined,
        signatureValid: result.verdictVerification?.signatureValid,
        boundToContract: result.verdictVerification?.boundToContract,
        verdictOutcome: result.verdict?.outcome,
      }),
      // The auditor's reason, taken from the criterion that failed rather than
      // invented here. Absent when nothing failed, which is the correct shape:
      // a rejection with no stated cause should read as missing, not as ''.
      detail: result.verdict?.scores?.find((s) => s.outcome === 'FAILED')?.criterionId,
    });

    // Checked EVERY round, not once at the end. A substituted auditor means the
    // rounds already run were judged by different people, so continuing would
    // accumulate more work under an invariant that is already broken.
    const stability = auditorIsStable(rounds);
    if (!stability.stable) {
      throw new Error(
        `the drawn auditor changed at round ${stability.at}: ` +
          `${rounds[0].auditorDid} → ${rounds[stability.at].auditorDid}. ` +
          'The assignment must be identical across revisions — a moving beacon ' +
          'silently re-draws, which hands the doer a fresh judge per rejection ' +
          'and is checker-shopping spread across rounds.'
      );
    }

    state = evaluateAcceptance(rounds, policy);
    if (isTerminal(state)) break;
  }

  return {
    state,
    rounds,
    attempts,
    // Bound to ACCEPTED explicitly rather than to "the last attempt", so an
    // EXHAUSTED run cannot hand back its final rejected attempt as a delivery.
    delivered: state.status === 'ACCEPTED' ? attempts[state.round] : undefined,
  };
}
