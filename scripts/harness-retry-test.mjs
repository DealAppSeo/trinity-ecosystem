#!/usr/bin/env node
// scripts/harness-retry-test.mjs — the retry_on predicate and its schedule.
//
// Run: node scripts/harness-retry-test.mjs
//
// Every assertion is written so it FAILS if the mechanism under test is removed.
// The load-bearing ones, called out because they are the reason the module is
// shaped this way rather than as a retry loop with a list of error types:
//
//   * 'the predicate is asked BEFORE the budget' — fails if the order is
//     swapped, which is the subtle way `not_retryable` becomes `exhausted` and
//     a permanent error starts reading as bad luck.
//   * 'an idle timeout retries, a run timeout does not' — fails if the built-in
//     predicate stops consuming the run/idle attribution, which is the only
//     thing making it more than a generic backoff helper.
//   * 'the cap is applied before jitter' — fails if the ceiling is applied to
//     the jittered value, which lets a delay exceed a bound the caller believes
//     is absolute.
//   * 'retryOn is required' — fails if a default predicate is ever introduced.

import { compileHarness, createChecker } from './lib/harness-compile.mjs';

const { load } = compileHarness();
const { ManualClock } = await load('types');
const { TimeoutPolicy, AttemptTimeoutError } = await load('timeout');
const { RetryPolicy, retryIdleTimeoutsOnly } = await load('retry');

const { check, eq, truthy, report } = createChecker('harness-retry');

/** Deterministic Rng so every delay assertion is exact. */
const fixedRng = (value) => ({ next: () => value });

const BASE = {
  maxAttempts: 3,
  initialDelayMs: 100,
  backoffFactor: 2,
  maxDelayMs: 10_000,
  jitter: 0,
  retryOn: () => true,
};

const mk = (over = {}, rngValue = 0.5) =>
  new RetryPolicy(new ManualClock(0), fixedRng(rngValue), { ...BASE, ...over });

const fail = (over = {}) => ({ error: new Error('boom'), attempt: 1, elapsedMs: 0, ...over });

/**
 * Build a real AttemptTimeoutError of the given kind, via TimeoutPolicy itself
 * rather than by hand — a hand-built expiry would still pass if the two kinds
 * ever stopped being distinguishable at the source.
 *
 * The run case has to HEARTBEAT its way there: with an idle deadline of 100ms,
 * simply advancing past the run deadline trips idle first. Holding idle off with
 * progress signals while the total budget runs out is exactly the situation the
 * run deadline exists for — a task that is alive, progressing, and still too
 * long.
 */
const timeoutErrorOfKind = (kind) => {
  const clock = new ManualClock(0);
  const tp = new TimeoutPolicy(clock, { runTimeoutMs: 1_000, idleTimeoutMs: 100 });
  const handle = tp.begin('e1', 'a1');
  if (kind === 'idle') {
    clock.advance(100);
  } else {
    for (let elapsed = 0; elapsed < 1_000; elapsed += 50) {
      clock.advance(50);
      tp.heartbeat(handle.id);
    }
  }
  const [expiry] = tp.sweep();
  eq(expiry.kind, kind, `fixture produced a ${kind} expiry`);
  return new AttemptTimeoutError(expiry);
};

// ── configuration guards ─────────────────────────────────────────────────────

const rejects = (over, why) => {
  let threw = false;
  try {
    mk(over);
  } catch {
    threw = true;
  }
  eq(threw, true, why);
};

check('retryOn is required — no default predicate exists', () => {
  rejects({ retryOn: undefined }, 'a missing retryOn must throw rather than default');
});

check('rejects a maxAttempts below 1', () => rejects({ maxAttempts: 0 }, 'maxAttempts=0 must throw'));

check('rejects a shrinking backoff', () => {
  // A factor below 1 retries a struggling dependency harder each time.
  rejects({ backoffFactor: 0.5 }, 'backoffFactor<1 must throw');
});

check('rejects jitter outside [0, 1]', () => {
  rejects({ jitter: -0.1 }, 'negative jitter must throw');
  rejects({ jitter: 1.5 }, 'jitter above 1 must throw');
});

// ── the three outcomes ───────────────────────────────────────────────────────

check('a retryable failure inside budget retries, and names the next attempt', () => {
  const d = mk().decide(fail({ attempt: 1 }));
  eq(d.kind, 'retry', 'kind');
  eq(d.attempt, 2, 'the NEXT attempt number, not the one that failed');
  eq(d.delayMs, 100, 'first delay is the initial interval');
});

check('a failure the predicate declines is not_retryable, not exhausted', () => {
  const d = mk({ retryOn: () => false }).decide(fail({ attempt: 1 }));
  eq(d.kind, 'not_retryable', 'kind');
  eq(d.attempt, 1, 'reports the attempt that failed');
  truthy(typeof d.reason === 'string' && d.reason.length > 0, 'carries a reason');
});

check('a retryable failure at the budget is exhausted', () => {
  const d = mk({ maxAttempts: 3 }).decide(fail({ attempt: 3 }));
  eq(d.kind, 'exhausted', 'kind');
  eq(d.attempts, 3, 'reports how many were spent');
});

check('maxAttempts is a TOTAL, so maxAttempts:1 never retries', () => {
  eq(mk({ maxAttempts: 1 }).decide(fail({ attempt: 1 })).kind, 'exhausted', 'one attempt means no retry');
});

check('the predicate is asked BEFORE the budget', () => {
  // The load-bearing ordering assertion. On the final attempt both conditions
  // hold; a permanent error must still report as not_retryable, because
  // "the request is wrong" and "we ran out of tries" send a reader to
  // different places.
  const d = mk({ maxAttempts: 3, retryOn: () => false }).decide(fail({ attempt: 3 }));
  eq(d.kind, 'not_retryable', 'declined-at-the-budget must not read as exhausted');
});

// ── the predicate sees context, not just the error ───────────────────────────

check('the predicate receives the attempt, elapsed time and expert', () => {
  let seen = null;
  mk({
    retryOn: (f) => {
      seen = f;
      return true;
    },
  }).decide(fail({ attempt: 2, elapsedMs: 4_242, expert: 'e9' }));
  eq(seen.attempt, 2, 'attempt');
  eq(seen.elapsedMs, 4_242, 'elapsedMs');
  eq(seen.expert, 'e9', 'expert');
  truthy(seen.error instanceof Error, 'the raw error');
});

check('a predicate can decide on context alone — the thing a type list cannot do', () => {
  // Same error object, opposite verdicts, decided by elapsed time.
  const policy = mk({ retryOn: (f) => f.elapsedMs < 1_000 });
  const err = new Error('identical');
  eq(policy.decide({ error: err, attempt: 1, elapsedMs: 999 }).kind, 'retry', 'young');
  eq(policy.decide({ error: err, attempt: 1, elapsedMs: 1_001 }).kind, 'not_retryable', 'old');
});

// ── retryIdleTimeoutsOnly — consuming the run/idle attribution ───────────────

check('an idle timeout retries, a run timeout does not', () => {
  const policy = mk({ retryOn: retryIdleTimeoutsOnly });
  eq(policy.decide(fail({ error: timeoutErrorOfKind('idle') })).kind, 'retry', 'idle is a reasonable bet');
  eq(
    policy.decide(fail({ error: timeoutErrorOfKind('run') })).kind,
    'not_retryable',
    'a run timeout retried spends another full budget to hit the same wall'
  );
});

check('retryIdleTimeoutsOnly declines errors it cannot classify', () => {
  // It makes a claim about timeouts only. Answering for anything else would be
  // the guessed default the module refuses to ship.
  eq(retryIdleTimeoutsOnly(fail({ error: new Error('who knows') })), false, 'non-timeout declined');
  eq(retryIdleTimeoutsOnly(fail({ error: 'a string' })), false, 'non-Error declined');
});

// ── the schedule ─────────────────────────────────────────────────────────────

check('backoff is geometric in the attempt number', () => {
  const p = mk({ initialDelayMs: 100, backoffFactor: 2 });
  eq(p.delayFor(1), 100, 'attempt 1');
  eq(p.delayFor(2), 200, 'attempt 2');
  eq(p.delayFor(3), 400, 'attempt 3');
});

check('backoffFactor of 1 gives a constant delay', () => {
  const p = mk({ backoffFactor: 1, initialDelayMs: 250 });
  eq(p.delayFor(1), 250, 'first');
  eq(p.delayFor(5), 250, 'fifth');
});

check('the delay is capped by maxDelayMs', () => {
  const p = mk({ initialDelayMs: 100, backoffFactor: 10, maxDelayMs: 500 });
  eq(p.delayFor(1), 100, 'below the cap');
  eq(p.delayFor(3), 500, 'clamped, not 10000');
});

check('the cap is applied BEFORE jitter', () => {
  // With the cap applied afterwards, an rng of 1 would return above maxDelayMs.
  // Band is [cap*(1-j), cap*(1+j)] = [400, 600] for cap 500, jitter 0.2.
  const p = mk({ initialDelayMs: 100, backoffFactor: 10, maxDelayMs: 500, jitter: 0.2 }, 1);
  eq(p.delayFor(3), 600, 'jitter widens around the CAP, deterministically');
  const low = mk({ initialDelayMs: 100, backoffFactor: 10, maxDelayMs: 500, jitter: 0.2 }, 0);
  eq(low.delayFor(3), 400, 'lower edge of the band');
});

check('jitter of 0 is exactly deterministic', () => {
  const p = mk({ jitter: 0 }, 0.987654);
  eq(p.delayFor(2), 200, 'rng is not consulted when jitter is 0');
});

check('jitter spreads symmetrically around the base delay', () => {
  const mid = mk({ initialDelayMs: 1_000, backoffFactor: 1, jitter: 0.2 }, 0.5);
  eq(mid.delayFor(1), 1_000, 'the midpoint is the un-jittered delay');
});

check('an out-of-range rng cannot push the delay outside the band', () => {
  // next() is expected in [0, 1). A misbehaving source must be clamped rather
  // than trusted, or the "bounded delay" claim quietly stops holding.
  const high = mk({ initialDelayMs: 1_000, backoffFactor: 1, jitter: 0.5 }, 99);
  eq(high.delayFor(1), 1_500, 'clamped to the upper edge');
  const low = mk({ initialDelayMs: 1_000, backoffFactor: 1, jitter: 0.5 }, -99);
  eq(low.delayFor(1), 500, 'clamped to the lower edge');
});

check('the delay never goes negative', () => {
  const p = mk({ initialDelayMs: 0, backoffFactor: 1, jitter: 1 }, 0);
  truthy(p.delayFor(1) >= 0, 'floored at zero');
});

// ── it does not sleep ────────────────────────────────────────────────────────

check('decide() returns immediately and does not advance the clock', () => {
  const clock = new ManualClock(0);
  // maxDelayMs raised too: BASE caps at 10s, which would quietly turn this into
  // an assertion about the cap rather than about not sleeping.
  const p = new RetryPolicy(clock, fixedRng(0.5), {
    ...BASE,
    initialDelayMs: 60_000,
    maxDelayMs: 60_000,
  });
  const before = clock.now();
  const d = p.decide(fail({ attempt: 1 }));
  eq(d.delayMs, 60_000, 'it reports a minute');
  eq(clock.now(), before, 'and waits none of it — the caller owns scheduling');
});

report();
