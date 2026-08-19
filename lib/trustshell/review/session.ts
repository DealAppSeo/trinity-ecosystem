// lib/trustshell/review/session.ts — submit-for-review, as a callable session.
//
// The logic behind `app/api/trustshell/review/route.ts`. It lives here and not
// in the route because a route cannot be asserted without a server, and the
// spine's whole history is modules that were correct and never exercised by
// anything but their own test. The check suite drives THIS with real keys, so
// the tested path and the served path are the same path.
//
// ── WHAT THIS SURFACE IS, AND WHAT IT IS NOT ─────────────────────────────────
//
// It is SUBMIT-FOR-REVIEW. The caller did the work; this runs the contracted
// review over it — draw an auditor the doer did not choose, run the judged
// loop, and return an acceptance state with a portable envelope when signed off.
//
// It is NOT a work-execution surface. The kernel's model client here hands off
// the deliverable the caller already produced; no generation happens server
// side. Pretending otherwise would put a "generate" step in a request that has
// no agent behind it.
//
// ── THE INDEPENDENCE THIS CAN AND CANNOT CLAIM ───────────────────────────────
//
// STATE IT PLAINLY, because the mechanism is easy to oversell. The draw
// guarantees the DOER'S SOFTWARE did not choose its judge: the seed is
// H(requestCommitment ‖ beacon ‖ poolCommitment), fixed before the beacon
// exists and identical on every re-run.
//
// It does NOT make the auditor independent of the OPERATOR. This surface holds
// the auditor seeds, so whoever runs it could in principle run the pool. The
// separation here is organisational, not cryptographic. Making it
// cryptographic needs auditors holding their own keys and signing remotely,
// which is a different interface — `runAcceptedWork` takes CryptoKeys and so
// requires the signer in-process. That is a real limit, recorded rather than
// papered over.
//
// What the surface DOES give a third party is checkability: the returned
// envelope verifies offline against the contract, and the assignment proof lets
// anyone recompute the draw and confirm the auditor was not chosen.
//
// ── WHY THE CALLER RESUBMITS ITS EARLIER ATTEMPTS ────────────────────────────
//
// Sessions are STATELESS. A revision arrives in a later request, so the caller
// sends the whole attempt history and the loop replays it. Two consequences,
// both deliberate:
//
//   * earlier rounds are re-judged. Harmless where judging is deterministic,
//     and it keeps the surface from holding half-finished reviews it would then
//     have to expire, garbage-collect and authorise access to.
//   * the doer cannot rewrite history it has already been judged on without
//     that being visible — the digests it resubmits are the ones the auditor
//     saw, and changing an earlier one changes the whole replay.
//
// When the attempts run out and the auditor has not signed off, the loop stops
// on a NON-TERMINAL state (normally REVISE) and the response says so. That is
// the correct answer, not an error: the ball is with the doer.

import { keyPairFromSeed, type Did } from '../identity/did';
import { runAcceptedWork, type AcceptedWorkResult } from '../identity/spine';
import {
  DEFAULT_MAX_REJECTIONS,
  DEFAULT_MAX_ROUNDS,
  type AcceptancePolicy,
} from '../identity/acceptance-loop';
import type { JudgeTier } from '../identity/staged-judge';

/** One thing the doer submitted, in the order it submitted them. */
export interface SubmittedAttempt {
  /** What the caller produced. Handed off verbatim; never regenerated here. */
  deliverable: string;
  /**
   * Digest of that deliverable.
   *
   * Supplied rather than computed so it is the CALLER'S commitment. A digest
   * this surface computed would be a claim about bytes it received, which is
   * not the same as the doer attesting to what it submitted.
   */
  digest: string;
}

export interface ReviewRequest {
  taskId: string;
  /** What the work was supposed to be. Goes into the contract. */
  deliverableSpec: string;
  /** Ordered attempt history, oldest first. */
  attempts: readonly SubmittedAttempt[];
  /**
   * A value nobody in the transaction controls — a drand round, a block hash.
   *
   * MUST be constant across the whole review, and the caller supplies it
   * because it is part of what it committed to. A beacon that moves between
   * requests re-draws the auditor, which `runAcceptedWork` refuses.
   */
  beacon: string;
  nonce: string;
  proposedAt: string;
}

/** Seeds and pool configuration, resolved from the environment by the route. */
export interface ReviewConfig {
  /** Base58 seed for the agent being reviewed. */
  doerSeed: string;
  /** Base58 seeds for the auditor panel. */
  auditorSeeds: readonly string[];
  /** Tier floor. Ranking DEFINES the pool; the draw inside it stays uniform. */
  minTier: number;
  requiredBadges: readonly string[];
  policy?: AcceptancePolicy;
}

export const MIN_AUDITOR_POOL = 2;

export class ReviewConfigError extends Error {}

/**
 * Read configuration, or throw naming the variable.
 *
 * No fallbacks and no defaults for the seeds — `lib/CLAUDE.md` is explicit that
 * missing configuration must throw and name the variable, and the reason bites
 * harder here than for a database URL: a generated-on-the-fly key produces a
 * perfectly well-formed signature attesting to an identity nobody holds.
 */
export function reviewConfigFrom(env: Record<string, string | undefined>): ReviewConfig {
  const doerSeed = env.TRUSTSHELL_DOER_SEED?.trim();
  if (!doerSeed) {
    throw new ReviewConfigError(
      'TRUSTSHELL_DOER_SEED is not set. The reviewed agent signs its own ' +
        'contract, so without its seed this surface would have to mint an ' +
        'identity — producing a valid signature for an agent that does not ' +
        'exist. Refusing to review.'
    );
  }

  const raw = env.TRUSTSHELL_AUDITOR_SEEDS?.trim();
  const auditorSeeds = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
  if (auditorSeeds.length < MIN_AUDITOR_POOL) {
    throw new ReviewConfigError(
      `TRUSTSHELL_AUDITOR_SEEDS must list at least ${MIN_AUDITOR_POOL} ` +
        `comma-separated seeds; got ${auditorSeeds.length}. A draw from one ` +
        'candidate identifies the auditor exactly — it is a named checker ' +
        "wearing a lottery's clothes, which is the thing the draw exists to " +
        'prevent.'
    );
  }

  const minTier = Number(env.TRUSTSHELL_MIN_AUDITOR_TIER ?? '3');
  if (!Number.isFinite(minTier) || minTier < 0) {
    throw new ReviewConfigError(
      `TRUSTSHELL_MIN_AUDITOR_TIER must be a non-negative number; got ` +
        `${JSON.stringify(env.TRUSTSHELL_MIN_AUDITOR_TIER)}.`
    );
  }

  const badges = env.TRUSTSHELL_AUDITOR_BADGES?.trim();
  return {
    doerSeed,
    auditorSeeds,
    minTier,
    requiredBadges: badges ? badges.split(',').map((s) => s.trim()).filter(Boolean) : [],
  };
}

export interface ReviewOutcome {
  status: AcceptedWorkResult['state']['status'];
  state: AcceptedWorkResult['state'];
  /** The auditor the draw produced. Constant across the whole review. */
  auditorDid?: Did;
  rounds: AcceptedWorkResult['rounds'];
  /** Present only when signed off. Verifies offline against the contract. */
  envelope?: AcceptedWorkResult['attempts'][number]['envelope'];
  /**
   * True when the loop stopped because the attempt history ran out rather than
   * because a decision was reached. The caller's cue to submit a revision.
   */
  awaitingRevision: boolean;
}

/**
 * Run a contracted review over a submitted attempt history.
 *
 * `tiers` is injected rather than constructed here: the judges are the
 * expensive, environment-dependent part, and a surface that hard-coded them
 * could not be exercised without them.
 */
export async function runReviewSession(input: {
  request: ReviewRequest;
  config: ReviewConfig;
  tiers: readonly JudgeTier[];
  bank: readonly { id: string; statement: string; minScore: number }[];
  criteriaCount?: number;
  now?: () => Date;
  observedAt: string;
}): Promise<ReviewOutcome> {
  const { request, config } = input;

  if (request.attempts.length === 0) {
    throw new ReviewConfigError('attempts must contain at least one submission');
  }

  // An EMPTY deliverable is refused here rather than reviewed.
  //
  // It cannot be caught downstream: the judge sees `evidence`, which is the
  // rendered TRACE, and a trace of "presented an empty submission" is not
  // itself empty. So `mechanicalJudge`'s vacuity check — which asks whether
  // anything was RECORDED — correctly says no defect, and empty work escalates
  // as if it were merely hard to judge. Found by asserting it end to end.
  //
  // Refusing is also the right shape: there is no review to run on nothing, and
  // spending a drawn auditor and a signed verdict on it would produce a
  // perfectly valid rejection of a request that should never have been made.
  for (const [i, a] of request.attempts.entries()) {
    if (a.deliverable.trim().length === 0) {
      throw new ReviewConfigError(
        `attempts[${i}].deliverable is empty. There is nothing to review; this is a ` +
          'malformed submission rather than work that fails its criteria.'
      );
    }
    if (a.digest.trim().length === 0) {
      throw new ReviewConfigError(`attempts[${i}].digest is empty`);
    }
  }

  const doer = await keyPairFromSeed(config.doerSeed);
  const auditors = await Promise.all(config.auditorSeeds.map((s) => keyPairFromSeed(s)));
  const keyFor = new Map(auditors.map((a) => [a.did, a.privateKey]));

  // The doer is deliberately NOT added to the candidate list. `eligiblePool`
  // would exclude it and the spine re-asserts checker≠doer, but the surest way
  // not to draw the examinee is not to enter it in the draw.
  const candidates = auditors.map((a) => ({
    did: a.did,
    qualification: { tier: config.minTier, badges: config.requiredBadges },
  }));

  const result = await runAcceptedWork({
    assignment: {
      taskId: request.taskId,
      doerDid: doer.did,
      deliverable: request.deliverableSpec,
      requirement: { minTier: config.minTier, requiredBadges: config.requiredBadges },
      nonce: request.nonce,
      beacon: request.beacon,
      candidates,
      bank: input.bank,
      criteriaCount: input.criteriaCount ?? 2,
      proposedAt: request.proposedAt,
    },
    doerKey: doer.privateKey,
    checkerKeyFor: (did) => keyFor.get(did),
    tiers: input.tiers,
    now: input.now,
    observedAt: input.observedAt,
    policy: config.policy ?? {
      maxRejections: DEFAULT_MAX_REJECTIONS,
      maxRounds: DEFAULT_MAX_ROUNDS,
    },
    // Serve the submitted history in order, then stop. Returning null rather
    // than repeating the last attempt matters: a repeat would be scored STALLED,
    // blaming the doer for not revising work it has not yet been told about.
    attempt: ({ round }) => {
      const submitted = request.attempts[round];
      if (!submitted) return null;
      return {
        submissionDigest: submitted.digest,
        execution: submissionExecution(submitted.deliverable, input.now ?? (() => new Date())),
      };
    },
  });

  const delivered = result.delivered;
  return {
    status: result.state.status,
    state: result.state,
    auditorDid: result.rounds[0]?.auditorDid,
    rounds: result.rounds,
    envelope: delivered?.envelope,
    // Non-terminal means the loop ran out of submissions, because every other
    // exit is terminal by construction.
    awaitingRevision:
      result.state.status === 'REVISE' || result.state.status === 'NOT_STARTED',
  };
}

/**
 * A kernel execution that puts the submitted artefact in front of the judge.
 *
 * ── WHY THE DELIVERABLE ARRIVES AS A TOOL OBSERVATION ───────────────────────
 *
 * The first version of this handed the deliverable off as the agent's `summary`
 * and made no tool calls. It ran, it signed, it produced envelopes — and the
 * judge never saw the submission. `renderEvidence` renders TOOL CALLS ONLY, and
 * `JudgeRequest.evidence` says exactly why: *"Evidence, never the agent's
 * summary."* So the mechanical judge was reading a one-line trace with no
 * content in it, returning NOT_CHECKED for work that plainly declared itself
 * unfinished.
 *
 * That was caught by running the REAL judge through the REAL composition, not
 * by reading: every unit assertion passed, because they all injected a reviewer
 * that ignored its input.
 *
 * The architecture was right and the surface was wrong. An agent's own summary
 * is not evidence of anything; a recorded observation is. So the submission
 * enters as the observation of one read-only call, which is what it actually is
 * — an artefact the harness ingested.
 *
 * MARKED UNTRUSTED, deliberately. The submission is written by the party being
 * judged, so `untrustedOutputSources` includes it and the rendered evidence
 * carries `[untrusted source]`. The judge is told, in the material itself, that
 * this text is not an instruction source.
 *
 * ONE call, `read` effect, zero write budget. The review still cannot cause a
 * side effect; it can now see what it is reviewing.
 */
const SUBMISSION_TOOL = 'submission';

function submissionExecution(deliverable: string, now: () => Date) {
  return {
    policy: {
      maxIterations: 2,
      noProgressAbortAfter: 2,
      toolsAllowed: [SUBMISSION_TOOL],
      irreversibleRequiresHuman: [] as string[],
      // The artefact is authored by the examinee. Saying so is the whole point.
      untrustedOutputSources: [SUBMISSION_TOOL],
      maxWritesPerSession: 0,
      toolEffects: { [SUBMISSION_TOOL]: 'read' } as Record<string, 'read'>,
    },
    model: {
      calls: 0,
      async turn() {
        this.calls += 1;
        if (this.calls === 1) {
          return { calls: [{ id: 's1', name: SUBMISSION_TOOL, args: {} }] };
        }
        return {
          calls: [],
          handoff: {
            outcome: 'VERIFIED' as const,
            summary: 'submission presented for review',
            evidence: [] as string[],
          },
        };
      },
    },
    tools: {
      async call(call: { name?: string }) {
        if (call?.name !== SUBMISSION_TOOL) {
          // Not reachable through the allowlist, and it refuses rather than
          // returning something: a dispatcher that answers an unexpected name
          // is one allowlist edit away from being a general-purpose tool.
          throw new Error(
            `the review surface dispatches only ${SUBMISSION_TOOL}; got ${String(call?.name)}`
          );
        }
        return { content: deliverable };
      },
    },
    authorizer: {
      async authorize(request: { call?: { name?: string } }) {
        if (request?.call?.name === SUBMISSION_TOOL) {
          return { allowed: true as const, reason: 'presenting the submission for review' };
        }
        return {
          allowed: false as const,
          kind: 'not_in_allowlist' as const,
          reason: 'the review surface authorizes nothing but presenting the submission',
        };
      },
    },
    clock: { now: () => now().getTime() },
  };
}
