// lib/trustshell/identity/contracted-evaluator.ts
//
// Binds the agent loop's `Evaluator` port to a signed, contract-bound verdict.
//
// WHY IT LIVES HERE AND NOT IN harness/. Same reason as `loop-authorizer.ts`:
// the kernel may not import anything outside its own directory, so it declares
// a port and the adapter lives beside the artifacts it needs. Signing, DIDs and
// the contract format are all here; reimplementing any of them in the kernel
// would produce two copies of one rule, and two copies disagree silently.
//
// ── WHAT THIS COMPLETES ──────────────────────────────────────────────────────
//
// Three pieces existed and did not touch each other:
//
//   loop.ts            declared an Evaluator port with no implementation
//   work-contract.ts   could sign contracts and verdicts nothing produced
//   BFTEngine          could judge a claim, but only about payments
//
// This is the joint. A run now ends with a verdict that a third party can
// check without trusting us: WHO judged (a DID and a signature), AGAINST WHAT
// (a contract hash both parties signed), and OVER WHICH EVIDENCE (a hash of the
// actual turn record, not the agent's summary of it).
//
// ── THE JUDGE IS A PORT TOO ──────────────────────────────────────────────────
//
// Whether a three-provider BFT panel beats a single tuned evaluator at judging
// AGENT WORK is unmeasured — the panel's track record is on payment
// authorization and claim accuracy, which is a different task
// (docs/TRUST-HARNESS-DESIGN-2026-08-15.md §4.3). Both Claude and Grok flagged
// the extrapolation independently. So `Judge` is a port with the panel behind
// it, the A/B is a constructor argument, and no measurement is assumed.
//
// ── DISAGREEMENT IS RECORDED, NOT SILENTLY THRESHOLDED ───────────────────────
//
// A panel that splits 2–1 has told you something a majority vote throws away.
// The obvious move is to treat high disagreement as NOT_CHECKED and escalate.
// The obvious move requires a threshold, and THE CORRECT THRESHOLD IS
// UNMEASURED — inventing one would put a number into the verdict path that
// nothing justifies, which is how four figures in this repo came to be
// retracted.
//
// So: disagreement is always recorded, and gates only when the operator sets
// `maxDisagreement` explicitly. This is the opposite polarity from the loop's
// `requireIndependentEvaluation`, and deliberately: there, the strict behaviour
// was known to be correct, so absence means strict. Here the strict behaviour
// depends on a number nobody has measured, so absence means RECORD AND DO NOT
// ACT — which is what makes the number measurable in the first place. Choosing
// a threshold from data is a later change with data behind it; choosing one now
// would be a guess wearing a policy's clothes.

import { compareDids, sign, type Did } from './did';
import {
  contractPayload,
  issueVerdict,
  verifyContract,
  VERDICT_DOMAIN,
  type ContractCriterion,
  type CriterionScore,
  type Outcome,
  type Verdict,
  type WorkContract,
} from './work-contract';

/** Separator for the evidence encoding. Escape, never a raw byte. */
const SEP = '\u001f';

// ---------------------------------------------------------------------------
// The judge port
// ---------------------------------------------------------------------------

export interface JudgeRequest {
  criterion: ContractCriterion;
  /** What was supposed to be produced, from the contract. */
  deliverable: string;
  /** A rendering of what actually happened. Evidence, never the agent's summary. */
  evidence: string;
}

export interface JudgeOpinion {
  outcome: Outcome;
  /** In [0, 1] when the judge scored it. Absent is not a pass. */
  score?: number;
  /**
   * How much the judges disagreed, in [0, 1]. 0 is unanimous.
   *
   * ABSENT MEANS UNKNOWN, NOT UNANIMOUS. A single-model judge has no
   * disagreement to report and must not be recorded as having achieved
   * consensus — that would make the cheapest judge look like the most confident
   * one, which is exactly backwards.
   */
  disagreement?: number;
  detail: string;
}

export interface Judge {
  judge(request: JudgeRequest): Promise<JudgeOpinion>;
}

// ---------------------------------------------------------------------------
// The loop-facing shapes, restated
// ---------------------------------------------------------------------------
//
// Structurally identical to the kernel's `Evaluator` types and deliberately not
// imported from it. The kernel is meant to ship as a standalone package; an
// import here would be harmless in this direction, but it would make this file
// the place a future reader looks to learn what the kernel requires, and the
// two would drift. `check:types` catches a mismatch because the adapter is
// assigned to the port in the test.

export interface CriterionVerdict {
  criterionId: string;
  outcome: Outcome;
  score?: number;
  detail: string;
}

export interface EvaluationRequest {
  taskId: string;
  criteria: readonly { id: string; statement: string; minScore?: number }[];
  turns: readonly unknown[];
  claimed?: Outcome;
  doerDid?: string;
}

export interface Evaluation {
  verdicts: readonly CriterionVerdict[];
  evaluatorDid?: string;
  usage?: { inputTokens?: number; outputTokens?: number; costUsd?: number };
  detail: string;
}

// ---------------------------------------------------------------------------

export interface ContractedEvaluatorInput {
  /** The agreed contract. Its `checkerDid` must be the identity signing verdicts. */
  contract: WorkContract;
  /** The checker's signing key. */
  checkerKey: CryptoKey;
  judge: Judge;
  /**
   * Reference to the ControlProof authorizing this checker — read-only is the
   * intended shape. Absent is recorded as an unverified authority, never
   * defaulted to "authorized".
   */
  controlProofRef?: string;
  /**
   * Gate on panel disagreement, in [0, 1]. ABSENT MEANS RECORD BUT DO NOT GATE.
   *
   * See the header: the correct value is unmeasured, and a threshold nothing
   * justifies is worse than no threshold plus an honest number.
   */
  maxDisagreement?: number;
  /** Injected so the verdict's timestamp is not an ambient dependency. */
  now?: () => Date;
}

export interface ContractedEvaluation extends Evaluation {
  /** The signed artifact. Absent only when the contract itself did not verify. */
  verdict?: Verdict;
  /** Observed disagreement per criterion. Recorded even when it does not gate. */
  disagreement: Readonly<Record<string, number>>;
}

/**
 * An `Evaluator` that produces a signed, contract-bound verdict.
 *
 * Every path returns an `Evaluation` the loop can read; none throws for an
 * ordinary judgement failure. A judge outage is NOT_CHECKED and reaches the
 * loop as such, where it caps the ceiling — throwing would also cap it, via the
 * kernel's catch, but it would discard the per-criterion detail that says WHICH
 * criteria were never reached.
 */
export function createContractedEvaluator(input: ContractedEvaluatorInput): {
  evaluate(request: EvaluationRequest): Promise<ContractedEvaluation>;
} {
  const now = input.now ?? (() => new Date());

  return {
    async evaluate(request: EvaluationRequest): Promise<ContractedEvaluation> {
      const { contract } = input;
      const contractCheck = await verifyContract(contract);

      // A contract that does not verify cannot be judged against. Returning
      // NOT_CHECKED per criterion rather than throwing keeps the reason visible
      // in the loop's record instead of collapsing to "the evaluator threw".
      if (contractCheck.outcome !== 'VERIFIED') {
        return {
          verdicts: request.criteria.map((c) => ({
            criterionId: c.id,
            outcome: 'NOT_CHECKED' as Outcome,
            detail: 'the contract this evaluation rests on did not verify',
          })),
          evaluatorDid: contract.checkerDid,
          disagreement: {},
          detail: `no verdict was issued: ${contractCheck.detail}`,
        };
      }

      // THE DOER MUST BE THE ONE THE CONTRACT NAMES. Without this, a valid
      // contract could be used to certify work done by somebody else entirely —
      // every signature checks out and the verdict vouches for the wrong agent.
      if (compareDids(request.doerDid, contract.doerDid) === 'different') {
        return {
          verdicts: request.criteria.map((c) => ({
            criterionId: c.id,
            outcome: 'NOT_CHECKED' as Outcome,
            detail: 'the work was done by an agent this contract does not name',
          })),
          evaluatorDid: contract.checkerDid,
          disagreement: {},
          detail:
            `the run was performed by ${request.doerDid} but the contract names ` +
            `${contract.doerDid}, so this verdict would vouch for the wrong agent`,
        };
      }

      // THE CRITERIA JUDGED ARE THE CONTRACT'S, NOT THE REQUEST'S. The loop
      // passes criteria too, and if the two ever disagree the signed contract
      // is the authority — otherwise a caller could hand the evaluator an
      // easier list than the one both parties signed, which is the re-scoping
      // attack arriving through the front door instead of the back.
      const criteria = contract.criteria;
      const requested = new Set(request.criteria.map((c) => c.id));
      const contracted = new Set(criteria.map((c) => c.id));
      const mismatch =
        requested.size !== contracted.size || [...contracted].some((id) => !requested.has(id));

      const evidence = renderEvidence(request.turns);
      const evidenceHash = await hash(evidence);

      const verdicts: CriterionVerdict[] = [];
      const scores: CriterionScore[] = [];
      const disagreement: Record<string, number> = {};

      for (const criterion of criteria) {
        let opinion: JudgeOpinion;
        try {
          opinion = await input.judge.judge({
            criterion,
            deliverable: contract.deliverable,
            evidence,
          });
        } catch (e) {
          // A judge that could not answer has said nothing about the work.
          // FAILED here would turn a provider outage into a defect report.
          verdicts.push({
            criterionId: criterion.id,
            outcome: 'NOT_CHECKED',
            detail: `the judge could not answer: ${(e as Error).message}`,
          });
          scores.push({ criterionId: criterion.id, outcome: 'NOT_CHECKED' });
          continue;
        }

        if (typeof opinion.disagreement === 'number' && Number.isFinite(opinion.disagreement)) {
          disagreement[criterion.id] = opinion.disagreement;
        }

        // Disagreement gates ONLY when the operator set a threshold. A split
        // panel has not established the answer — but see the header for why
        // that judgement is not made on this file's own authority.
        const split =
          input.maxDisagreement !== undefined &&
          typeof opinion.disagreement === 'number' &&
          opinion.disagreement > input.maxDisagreement;

        const outcome: Outcome = split ? weaker(opinion.outcome, 'NOT_CHECKED') : opinion.outcome;
        const detail = split
          ? `${opinion.detail} — the judges disagreed by ${opinion.disagreement}, above the ` +
            `configured maximum of ${input.maxDisagreement}, so this is unestablished rather than judged`
          : opinion.detail;

        verdicts.push({ criterionId: criterion.id, outcome, score: opinion.score, detail });
        scores.push({ criterionId: criterion.id, outcome, score: opinion.score });
      }

      // The verdict's own outcome is the weakest per-criterion result. It is
      // ADVISORY: `verifyVerdict` recomputes it against the contract's floors
      // and overrules a lenient checker. Recording it anyway keeps the checker's
      // own claim in the signed artifact, which is what makes a later
      // disagreement between claim and recomputation visible instead of lost.
      let overall: Outcome = 'VERIFIED';
      for (const v of verdicts) overall = weaker(overall, v.outcome);

      const verdict = await issueVerdict({
        unsigned: {
          version: VERDICT_DOMAIN,
          contractHash: contractCheck.contractHash,
          evidenceHash,
          checkerDid: contract.checkerDid,
          controlProofRef: input.controlProofRef,
          outcome: overall,
          scores,
          issuedAt: now().toISOString(),
        },
        checkerKey: input.checkerKey,
      });

      return {
        verdicts,
        evaluatorDid: contract.checkerDid,
        verdict,
        disagreement,
        detail: mismatch
          ? `judged the ${criteria.length} criteria in the signed contract, which differ from ` +
            'the criteria the caller supplied — the contract is the authority'
          : `judged all ${criteria.length} agreed criteria`,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

/**
 * Render the run record into something a judge can read and a hash can pin.
 *
 * WHAT IS DELIBERATELY EXCLUDED: the agent's `note` and its handoff `summary`.
 * Those are the agent's narration of its own work, and a judge that reads them
 * is being told the answer by the party under examination. The judge sees what
 * was CALLED and what came BACK. Anthropic measured evaluators being talked
 * into leniency; this is the cheapest structural defence against it.
 *
 * Tool output IS included, and is the one place untrusted text reaches the
 * judge. That exposure is real and cannot be removed — judging a run without
 * seeing its results is not judging. It is bounded rather than eliminated: the
 * judge's output is parsed as a verdict, never executed, and its verdict cannot
 * widen any authority because the loop's policy is frozen before the evaluator
 * is ever called.
 */
export function renderEvidence(turns: readonly unknown[]): string {
  const lines: string[] = [];
  for (const raw of turns) {
    const turn = raw as {
      turn?: number;
      calls?: readonly {
        call?: { name?: string; args?: unknown };
        effect?: string;
        verdict?: { allowed?: boolean; reason?: string };
        observation?: { outcome?: string; content?: string; untrusted?: boolean };
      }[];
      madeProgress?: boolean;
    };
    lines.push(`turn ${turn.turn ?? '?'} progress=${turn.madeProgress ?? '?'}`);
    for (const call of turn.calls ?? []) {
      const name = call.call?.name ?? '?';
      if (call.verdict?.allowed === false) {
        lines.push(`  DENIED ${name}: ${call.verdict.reason ?? ''}`);
        continue;
      }
      const obs = call.observation;
      const flag = obs?.untrusted ? ' [untrusted source]' : '';
      lines.push(`  ${obs?.outcome ?? '?'} ${name}${flag}: ${obs?.content ?? ''}`);
    }
  }
  return lines.join('\n');
}

function weaker(a: Outcome, b: Outcome): Outcome {
  const rank: Record<Outcome, number> = { FAILED: 0, NOT_CHECKED: 1, VERIFIED: 2 };
  return rank[a] <= rank[b] ? a : b;
}

async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return (
    'sha256:' +
    Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  );
}

// ---------------------------------------------------------------------------
// Signing the contract half from an agent identity
// ---------------------------------------------------------------------------

/**
 * Convenience for the common case: the checker signs an attestation that it is
 * about to judge under a named ControlProof.
 *
 * Kept separate from `issueVerdict` because it answers a different question —
 * "under what authority is this checker acting" rather than "what did it find" —
 * and folding them together would let a verdict imply an authority it never
 * demonstrated.
 */
export async function attestCheckerAuthority(input: {
  checkerDid: Did;
  checkerKey: CryptoKey;
  contract: WorkContract;
  controlProofRef: string;
  at: string;
}): Promise<string> {
  const payload = [
    'zkrepid:checker-authority:v1',
    input.checkerDid,
    await hash(contractPayload(input.contract)),
    input.controlProofRef,
    input.at,
  ].join(SEP);
  return sign(input.checkerKey, payload);
}
