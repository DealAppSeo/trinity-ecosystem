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
// ── WHAT IT CAN CONCLUDE, WHICH DEPENDS ON CONFIGURATION ─────────────────────
//
// Two judge tiers, cheapest first (`lib/trustshell/review/judges.ts`).
//
// The MECHANICAL tier is unconditional and may never return VERIFIED — it can
// detect the absence of quality, never establish its presence. So with it alone
// this surface can REJECT work (empty submissions, and work whose own text says
// it is unfinished) and can NEVER sign anything off. That is a gate, not a
// review, and the response says so in `canAccept` rather than leaving a caller
// waiting for an acceptance that cannot arrive.
//
// The MODEL tier appears only when TRUSTSHELL_JUDGE_ENDPOINT, _API_KEY and
// _MODEL are all set. Partial configuration adds no tier and names what is
// missing: a half-configured judge fails per criterion as NOT_CHECKED, which
// escalates, which is indistinguishable from a model that could not decide.
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
import { judgeTiersFrom } from '@/lib/trustshell/review/judges';

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
 * Capability status. GET, no body, no side effects.
 *
 * WHY A GET EXISTS AT ALL. `canAccept` was reported only inside POST responses,
 * which means a dashboard or an operator had to submit work to discover that
 * the surface cannot sign anything off. A capability that can only be learned
 * by exercising it is not a capability anyone will notice — the same shape as a
 * held CI run that produces no check.
 *
 * `mode` is the load-bearing field: `reject-only` says, in one token, that
 * ACCEPTED is UNREACHABLE and no amount of revising will produce a sign-off.
 * That is an INCOMPLETE FEEDBACK LOOP, not a degraded one — a judge that can
 * only reject cannot improve work quality over time — so it is reported as a
 * first-class state rather than as an absence.
 */
export async function GET() {
  // Read inside the handler, never at module scope — see the POST handler.
  const judges = judgeTiersFrom(process.env);

  let seeds: 'configured' | 'missing' = 'configured';
  let seedError: string | undefined;
  try {
    reviewConfigFrom(process.env);
  } catch (err) {
    seeds = 'missing';
    seedError = err instanceof Error ? err.message : String(err);
  }

  const mode = seeds === 'missing'
    ? 'unavailable'
    : judges.canAccept
      ? 'full'
      : 'reject-only';

  return NextResponse.json(
    {
      surface: 'trustshell/review',
      // full        — can reject AND accept
      // reject-only — can reject; ACCEPTED is unreachable
      // unavailable — cannot review at all (no identity seeds)
      mode,
      canReject: seeds === 'configured',
      canAccept: judges.canAccept,
      judgeTiers: judges.tiers.map((t) => t.name),
      missingForAcceptance: judges.missing,
      seeds,
      seedError,
      // Stated rather than implied, because "reject-only" is easy to read as a
      // temporary degradation instead of a structural limit.
      explanation: judges.canAccept
        ? 'A model tier is configured, so a criterion can be judged MET.'
        : 'Only the mechanical tier is configured. It may NEVER return VERIFIED — it ' +
          'detects the absence of quality and cannot establish its presence — so ACCEPTED ' +
          'is unreachable and every clean submission escalates to NOT_CHECKED. Revising ' +
          'will not produce a sign-off. Set the variables in missingForAcceptance.',
    },
    {
      // 503 when nothing can be reviewed at all; 200 otherwise. reject-only is
      // a real, working mode — it is a gate — so it is not an error.
      status: mode === 'unavailable' ? 503 : 200,
      headers: {
        // Greppable from a log or a dashboard probe without parsing JSON.
        'x-trustshell-review-mode': mode,
      },
    }
  );
}

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

  // Assembled per request, from the environment, inside the handler — same
  // reason as the config above.
  const judges = judgeTiersFrom(process.env);

  let outcome;
  try {
    outcome = await runReviewSession({
      request: b as ReviewRequest,
      config,
      tiers: judges.tiers,
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
  const mode = judges.canAccept ? 'full' : 'reject-only';
  return NextResponse.json({
    status: outcome.status,
    // Same vocabulary as GET, so a caller reading either surface sees one word.
    mode,
    // A capability statement, not a detail. FALSE means only the mechanical
    // tier is configured, so ACCEPTED is unreachable and every clean
    // submission escalates to NOT_CHECKED. A caller that does not read this
    // will wait for a sign-off that cannot happen.
    canAccept: judges.canAccept,
    judgeTiers: judges.tiers.map((t) => t.name),
    missingForAcceptance: judges.missing,
    awaitingRevision: outcome.awaitingRevision,
    auditorDid: outcome.auditorDid,
    rounds: outcome.rounds,
    // Present only on ACCEPTED. A caller can verify it offline against the
    // contract without trusting this host.
    envelope: outcome.envelope,
    delivered: outcome.status === 'ACCEPTED',
  }, { headers: { 'x-trustshell-review-mode': mode } });
}
