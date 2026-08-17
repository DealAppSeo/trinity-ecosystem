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
  delegateAuditorGrant,
  type AuditorGrant,
  type AuditorGrantInput,
} from './auditor-grant';
import type { AgentIdentity } from './identity';
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

/**
 * What the caller must supply to mint the auditor's grant.
 *
 * Mirrors `AuditorGrantInput` minus the three fields this function derives:
 * `auditor` (the DRAWN checker — a caller that could name it would be choosing
 * the judge again), `doerDid` (the contract's), and `toolEffects` (the loop's).
 */
export interface AuditorGrantRequest {
  parent: AuditorGrantInput['parent'];
  delegator: AuditorGrantInput['delegator'];
  /**
   * Resolve the DRAWN checker's identity. Returning `undefined` throws — the
   * same reasoning as `checkerKeyFor`: substituting an auditor we happen to
   * hold an identity for is checker-shopping wearing an error handler.
   */
  auditorIdentityFor: (did: Did) => AgentIdentity | undefined;
  /** Checked against the tool maps, never trusted. */
  capabilities: readonly string[];
  toolCapabilities: AuditorGrantInput['toolCapabilities'];
  /** Required. An auditor grant that outlives the audit is a standing credential. */
  ttlSeconds: number;
}

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
  /**
   * Mint a provably read-only ControlProof for the DRAWN checker, and bind its
   * reference into the verdict.
   *
   * OPTIONAL, and the absence is honest rather than convenient: the contracted
   * evaluator records a missing `controlProofRef` as an *unverified* authority
   * and never as an authorized one. Supplying this is what turns "we say the
   * auditor was read-only" into something a third party can recompute.
   *
   * NOTE WHAT IS NOT HERE: `toolEffects`. It is taken from
   * `execution.policy.toolEffects` rather than accepted separately, and that is
   * the whole point of wiring the grant HERE instead of at the call site. A
   * grant analysed against a different effect map than the loop enforces is a
   * proof about a different world — it would verify perfectly and mean nothing.
   * One map, one source, no way to disagree.
   */
  auditorGrant?: AuditorGrantRequest;
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
  /**
   * The auditor's grant, when one was requested. Carries its own
   * `analysis.readOnly` proof, so a reader need not recompute the reachability
   * search to know what the checker could touch.
   */
  auditorGrant?: AuditorGrant;
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

  // 5. The auditor's authority, bounded by cryptography rather than by our
  //    good behaviour. `delegateAuditorGrant` REFUSES at mint time unless the
  //    capability set provably cannot reach a write — including tools the
  //    effect map does not classify, which count as writes because a tool
  //    nobody labelled is a blast radius nobody measured.
  let auditorGrant: AuditorGrant | undefined;
  if (input.auditorGrant) {
    const req = input.auditorGrant;
    const auditor = req.auditorIdentityFor(assigned.unsigned.checkerDid);
    if (!auditor) {
      throw new Error(
        `no identity for the drawn checker ${assigned.unsigned.checkerDid}, so no auditor ` +
          'grant can be minted for it. Refusing to continue: auditing under a different ' +
          "agent's grant would make the authority chain describe someone who did not judge."
      );
    }
    auditorGrant = await delegateAuditorGrant({
      parent: req.parent,
      delegator: req.delegator,
      auditor,
      doerDid: assignment.doerDid,
      capabilities: req.capabilities,
      toolCapabilities: req.toolCapabilities,
      // The loop's OWN map — see `auditorGrant` on the input type.
      toolEffects: execution.policy.toolEffects,
      ttlSeconds: req.ttlSeconds,
      now: input.now?.(),
    });
  }

  // 6. Cheap tiers first. FAILED is final; VERIFIED escalates.
  const staged = createStagedJudge({ tiers });
  const evaluator = createContractedEvaluator({
    contract,
    checkerKey,
    judge: staged.judge,
    // The delegate signature identifies THIS delegation uniquely and is
    // matchable by anyone holding the chain. `DelegatedControlProof` carries no
    // id field, and inventing one here would put a second identifier for the
    // same object into a signed artifact.
    controlProofRef: auditorGrant?.proof.delegateSignature,
    now: input.now,
  });

  // 7. The bounded loop, judged by someone the doer did not choose. The
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
    return { assigned, assemblyVerification, contract, auditorGrant, loop };
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
    auditorGrant,
    loop,
    verdict,
    verdictVerification,
    envelope,
    reputation,
  };
}
