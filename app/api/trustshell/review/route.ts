// app/api/trustshell/review/route.ts
//
// Submit work for contracted review. The first production surface that calls
// `runAcceptedWork`.
//
// The logic is in `lib/trustshell/review/session.ts` and is asserted by
// `npm run check:review-session` with real Ed25519 keys, a real draw, a real
// signed verdict and a real envelope. This file is HTTP: parse, resolve
// configuration, call, map outcomes to status codes.
//
// ── WHY THIS RETURNS 503 TODAY, AND WHY THAT IS THE HONEST ANSWER ────────────
//
// There is NO `Judge` implementation in this repository. `staged-judge.ts`
// composes tiers and `contracted-evaluator.ts` consumes one, but nothing
// implements the port — measured 2026-08-16, the only matches for a judge
// implementation are the port and the composer themselves.
//
// So the chain is complete except for the thing that forms an opinion. The
// options were: ship a stub tier that returns VERIFIED, ship one that returns
// NOT_CHECKED, or refuse.
//
//   * VERIFIED would be a review surface that signs off on everything — a
//     receipt-shaped artifact asserting an auditor approved work no auditor
//     read. That is the defect this repo is built against, at its worst.
//   * NOT_CHECKED runs the whole chain honestly and then reports REVISE,
//     because with no rejections and no acceptances the loop simply runs out of
//     submissions. A caller reads "revise" and rewrites work nobody judged.
//   * Refusing says the true thing: the surface is wired, and it is not
//     configured to conclude.
//
// The refusal is 503 SERVICE UNAVAILABLE rather than 501 or 500: the endpoint
// exists and is correct, and it will work the moment a judge is supplied. When
// one lands, it is passed to `runReviewSession({ tiers })` and this branch goes
// away — nothing else here changes.
//
// ── WHAT THIS ENDPOINT DOES NOT DO ───────────────────────────────────────────
//
// It does no work. The caller submits a deliverable it already produced; the
// kernel run here has an empty tool allowlist, a deny-all authorizer and a
// throwing dispatcher, so a review request cannot cause a side effect.
//
// It does not make the auditor independent of THIS OPERATOR. The draw proves
// the doer's software did not choose its judge; the seeds live here, so the
// separation from whoever runs the service is organisational. Stated in
// `session.ts` and repeated here because it is the claim most likely to be
// overread from the word "independent".

import { NextResponse } from 'next/server';
import {
  runReviewSession,
  reviewConfigFrom,
  ReviewConfigError,
  type ReviewRequest,
  type SubmittedAttempt,
} from '@/lib/trustshell/review/session';
import type { JudgeTier } from '@/lib/trustshell/identity/staged-judge';

export const dynamic = 'force-dynamic';

/**
 * The criteria bank the exam is drawn FROM.
 *
 * Deliberately generic and deliberately here rather than caller-supplied: a
 * caller that chose its own bank would be choosing its own exam, which is half
 * of what the draw exists to prevent. Per-task banks belong in configuration,
 * not in the request body.
 */
const BANK = [
  { id: 'spec-met', statement: 'The deliverable does what the specification asked.', minScore: 0.9 },
  { id: 'errors-handled', statement: 'Failure paths are handled and surfaced, not swallowed.', minScore: 0.9 },
  { id: 'no-placeholders', statement: 'No stubbed, mocked or TODO behaviour is presented as complete.', minScore: 0.9 },
  { id: 'verifiable', statement: 'The claims made can be checked by someone who did not write it.', minScore: 0.9 },
  { id: 'scoped', statement: 'The change does what was asked and not more.', minScore: 0.9 },
  { id: 'legible', statement: 'A competent engineer can follow it without the author present.', minScore: 0.9 },
  { id: 'consistent', statement: 'It matches the conventions of the surrounding work.', minScore: 0.9 },
  { id: 'complete', statement: 'Nothing required by the specification is missing.', minScore: 0.9 },
];

/**
 * Judge tiers, cheapest first.
 *
 * EMPTY, and that is a measurement rather than an oversight — see the header.
 * `runReviewSession` is not called with an empty list; the handler refuses
 * first, because a staged judge with no tiers returns NOT_CHECKED for every
 * criterion and a caller cannot tell that from a judge that ran and abstained.
 */
const TIERS: readonly JudgeTier[] = [];

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('body must be JSON');
  }

  const b = (body ?? {}) as Partial<ReviewRequest>;

  // Shape-checked before configuration is read, so a malformed request reads as
  // a caller error rather than as a misconfigured server.
  if (typeof b.taskId !== 'string' || b.taskId.length === 0) {
    return badRequest('taskId is required');
  }
  if (typeof b.deliverableSpec !== 'string' || b.deliverableSpec.length === 0) {
    return badRequest('deliverableSpec is required — the contract needs to say what was asked');
  }
  if (typeof b.beacon !== 'string' || b.beacon.length === 0) {
    return badRequest(
      'beacon is required and must be constant across a review. It is a value ' +
        'nobody in the transaction controls (a drand round, a block hash); a ' +
        'beacon that moves between requests re-draws the auditor.'
    );
  }
  if (typeof b.nonce !== 'string' || b.nonce.length === 0) return badRequest('nonce is required');
  if (typeof b.proposedAt !== 'string' || b.proposedAt.length === 0) {
    return badRequest('proposedAt is required');
  }
  if (!Array.isArray(b.attempts) || b.attempts.length === 0) {
    return badRequest(
      'attempts must be a non-empty array, oldest first. Sessions are stateless: ' +
        'resubmit the full history so the review can be replayed.'
    );
  }
  for (const [i, a] of (b.attempts as SubmittedAttempt[]).entries()) {
    if (typeof a?.deliverable !== 'string' || typeof a?.digest !== 'string' || !a.digest) {
      return badRequest(`attempts[${i}] must carry { deliverable, digest }`);
    }
  }

  // Read INSIDE the handler. At module scope this would run during `next build`
  // — which imports every route module to collect page data — and throw on a
  // builder that has no seeds, failing the build before a request is served.
  // That exact shape broke every deployment here from 2026-06-05 to 2026-08-11
  // (lib/CLAUDE.md).
  let config;
  try {
    config = reviewConfigFrom(process.env);
  } catch (err) {
    if (err instanceof ReviewConfigError) {
      return NextResponse.json({ error: err.message, configured: false }, { status: 503 });
    }
    throw err;
  }

  if (TIERS.length === 0) {
    return NextResponse.json(
      {
        error:
          'no Judge is configured, so this surface cannot conclude a review. The ' +
          'contract, the draw, the signing and the envelope are all wired and ' +
          'asserted (npm run check:review-session); what is missing is an ' +
          'implementation of the Judge port. Refusing rather than returning a ' +
          'verdict nobody formed.',
        configured: false,
        // Named so a caller can distinguish this from missing seeds without
        // parsing prose.
        missing: 'judge',
      },
      { status: 503 }
    );
  }

  let outcome;
  try {
    outcome = await runReviewSession({
      request: b as ReviewRequest,
      config,
      tiers: TIERS,
      bank: BANK,
      observedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // A refusal from the spine — an assignment that does not verify, a checker
    // this host cannot act as, a substituted auditor — is a 409, not a 500.
    // Those are correct outcomes of a well-formed request, and reporting them
    // as server errors would hide the one signal worth alerting on.
    return NextResponse.json({ error: message, refused: true }, { status: 409 });
  }

  // ACCEPTED is 200. Everything else is 200 as well: REVISE, EXHAUSTED,
  // STALLED and ABANDONED are all successful reviews with a non-delivery
  // result, and mapping them to 4xx would make "the auditor said no" look like
  // a malformed request.
  return NextResponse.json({
    status: outcome.status,
    awaitingRevision: outcome.awaitingRevision,
    auditorDid: outcome.auditorDid,
    rounds: outcome.rounds,
    // Present only on ACCEPTED. A caller can verify it offline against the
    // contract without trusting this host.
    envelope: outcome.envelope,
    delivered: outcome.status === 'ACCEPTED',
  });
}
