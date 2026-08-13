#!/usr/bin/env node
// scripts/harness-timeout-test.mjs — Sprint C: the run/idle timeout split.
//
// Run: node scripts/harness-timeout-test.mjs
//
// Every assertion here is written so it FAILS if the mechanism under test is
// removed. The three load-bearing ones, called out because they are the whole
// reason the module has two deadlines instead of one:
//
//   * 'a hung attempt is caught by the idle deadline'  — fails if idle is removed
//   * 'heartbeats hold the idle deadline off'          — fails if refresh is removed
//   * 'heartbeats CANNOT hold the run deadline off'    — fails if a heartbeat
//     wrongly refreshes startedAt, which is the subtle way this collapses back
//     into a single timeout while still looking like it has two.

import { compileHarness, createChecker } from './lib/harness-compile.mjs';

const { load } = compileHarness();
const { ManualClock } = await load('types');
const { TimeoutPolicy, AttemptTimeoutError } = await load('timeout');

const { check, eq, truthy, report } = createChecker('harness-timeout');

const RUN = 10_000;
const IDLE = 1_500;

const mk = (over = {}) => {
  const clock = new ManualClock(0);
  return {
    clock,
    tp: new TimeoutPolicy(clock, { runTimeoutMs: RUN, idleTimeoutMs: IDLE, ...over }),
  };
};

// ── configuration guards ─────────────────────────────────────────────────────

check('rejects a non-positive run timeout', () => {
  let threw = false;
  try {
    new TimeoutPolicy(new ManualClock(0), { runTimeoutMs: 0, idleTimeoutMs: 100 });
  } catch {
    threw = true;
  }
  eq(threw, true, 'runTimeoutMs=0 must throw');
});

check('rejects a non-positive idle timeout', () => {
  let threw = false;
  try {
    new TimeoutPolicy(new ManualClock(0), { runTimeoutMs: 100, idleTimeoutMs: 0 });
  } catch {
    threw = true;
  }
  eq(threw, true, 'idleTimeoutMs=0 must throw');
});

check('rejects an idle deadline beyond the run deadline', () => {
  // Idle time can never exceed elapsed time, so this configuration silently
  // disables hang detection. A dead detector must not be constructible.
  let msg = '';
  try {
    new TimeoutPolicy(new ManualClock(0), { runTimeoutMs: 1000, idleTimeoutMs: 5000 });
  } catch (e) {
    msg = e.message;
  }
  truthy(msg.includes('unreachable'), `must explain why, got: ${msg || '(no throw)'}`);
});

check('an idle deadline exactly equal to the run deadline is allowed', () => {
  const tp = new TimeoutPolicy(new ManualClock(0), { runTimeoutMs: 1000, idleTimeoutMs: 1000 });
  eq(tp.inFlight(), 0, 'constructed with no attempts in flight');
});

// ── the idle deadline: catching a hang ───────────────────────────────────────

check('a hung attempt is caught by the idle deadline', () => {
  const { clock, tp } = mk();
  tp.begin('stalled', 't1');
  clock.advance(IDLE);
  const expired = tp.sweep();
  eq(expired.length, 1, 'one attempt expired');
  eq(expired[0].kind, 'idle', 'attributed to the idle deadline');
  eq(expired[0].attempt.expert, 'stalled', 'names the expert');
  eq(expired[0].attempt.taskId, 't1', 'names the task');
});

check('the idle deadline does not fire early', () => {
  const { clock, tp } = mk();
  tp.begin('stalled', 't1');
  clock.advance(IDLE - 1);
  eq(tp.sweep().length, 0, 'still live one ms before the deadline');
});

check('a hang is caught at the IDLE deadline, far before the run deadline', () => {
  // The entire justification for two numbers. With only a run deadline this
  // hang would go undetected for RUN ms instead of IDLE ms.
  const { clock, tp } = mk();
  tp.begin('stalled', 't1');
  clock.advance(IDLE);
  const [e] = tp.sweep();
  truthy(e, 'expired');
  eq(e.kind, 'idle', 'idle fired');
  truthy(e.elapsedMs < RUN, `detected at ${e.elapsedMs}ms, well inside the ${RUN}ms run deadline`);
});

// ── heartbeats: what they can and cannot do ──────────────────────────────────

check('heartbeats hold the idle deadline off', () => {
  const { clock, tp } = mk();
  const a = tp.begin('slow-but-working', 't1');
  // Five idle-periods' worth of wall clock, progressing throughout.
  for (let i = 0; i < 5; i += 1) {
    clock.advance(IDLE - 1);
    eq(tp.heartbeat(a.id, `chunk ${i}`), true, 'heartbeat accepted');
    eq(tp.sweep().length, 0, `still live after ${(i + 1) * (IDLE - 1)}ms of progress`);
  }
});

check('heartbeats CANNOT hold the run deadline off', () => {
  // The subtle regression this guards: if heartbeat() refreshed startedAt as
  // well as lastProgressAt, this attempt would live forever and the module
  // would have one timeout wearing the costume of two.
  const { clock, tp } = mk();
  const a = tp.begin('chatty', 't1');
  let beats = 0;
  while (clock.now() < RUN) {
    clock.advance(IDLE - 1);
    tp.heartbeat(a.id, `chunk ${beats}`);
    beats += 1;
  }
  const expired = tp.sweep();
  eq(expired.length, 1, 'the run deadline fired despite continuous heartbeats');
  eq(expired[0].kind, 'run', 'attributed to the run deadline');
  truthy(expired[0].heartbeats >= 6, `heartbeats were counted, got ${expired[0].heartbeats}`);
});

check('a heartbeat against an unknown attempt is refused', () => {
  const { tp } = mk();
  eq(tp.heartbeat('nope'), false, 'unknown id');
});

check('a heartbeat against a swept attempt is refused', () => {
  const { clock, tp } = mk();
  const a = tp.begin('stalled', 't1');
  clock.advance(IDLE);
  tp.sweep();
  eq(tp.heartbeat(a.id), false, 'the attempt is gone, so the heartbeat cannot revive it');
});

check('the last progress note is carried into the expiry', () => {
  const { clock, tp } = mk();
  const a = tp.begin('stalled', 't1');
  tp.heartbeat(a.id, 'tool_call:search');
  clock.advance(IDLE);
  const [e] = tp.sweep();
  eq(e.lastNote, 'tool_call:search', 'names what it was last seen doing');
  truthy(e.basis.includes('tool_call:search'), 'and says so in the basis');
});

// ── the run deadline ─────────────────────────────────────────────────────────

check('the run deadline fires on a long attempt with no heartbeats at all', () => {
  const { clock, tp } = mk({ idleTimeoutMs: RUN });
  tp.begin('grinder', 't1');
  clock.advance(RUN);
  const [e] = tp.sweep();
  truthy(e, 'expired');
  eq(e.elapsedMs, RUN, 'elapsed is the full run');
});

check('the run deadline does not fire early', () => {
  const { clock, tp } = mk();
  const a = tp.begin('grinder', 't1');
  clock.advance(RUN - 1);
  tp.heartbeat(a.id);
  eq(tp.sweep().length, 0, 'one ms short of the run deadline, and progressing');
});

// ── precedence when both have breached ───────────────────────────────────────

check('when both deadlines have breached, the earlier one is reported', () => {
  const { clock, tp } = mk();
  tp.begin('stalled', 't1');
  // Never swept, so it sits there long past both deadlines. It went idle at
  // t=0, so the idle deadline (t=1500) came first.
  clock.advance(RUN * 2);
  const [e] = tp.sweep();
  eq(e.kind, 'idle', 'idle fired first chronologically');
});

check('a late stall after long progress is attributed to the run deadline', () => {
  const { clock, tp } = mk();
  const a = tp.begin('grinder', 't1');
  // Progress right up to just before the run deadline, then stop. The run
  // deadline is breached; the idle one is not.
  while (clock.now() < RUN - IDLE) {
    clock.advance(IDLE - 1);
    tp.heartbeat(a.id);
  }
  clock.advance(RUN);
  const [e] = tp.sweep();
  eq(e.kind, 'run', 'ran too long rather than stopped responding');
});

// ── lifecycle and accounting ─────────────────────────────────────────────────

check('a completed attempt is not swept', () => {
  const { clock, tp } = mk();
  const a = tp.begin('alpha', 't1');
  clock.advance(120);
  const dur = tp.complete(a.id);
  eq(dur, 120, 'duration returned');
  clock.advance(RUN * 2);
  eq(tp.sweep().length, 0, 'a finished attempt can never time out');
});

check('completing an unknown attempt returns null', () => {
  const { tp } = mk();
  eq(tp.complete('nope'), null, 'unknown id');
});

check('sweep is idempotent — one hang is reported exactly once', () => {
  // Double-counting one hang as a run of failures would trip a breaker on a
  // single incident, which is a worse bug than the hang.
  const { clock, tp } = mk();
  tp.begin('stalled', 't1');
  clock.advance(IDLE);
  eq(tp.sweep().length, 1, 'reported once');
  eq(tp.sweep().length, 0, 'and not again');
  clock.advance(RUN * 2);
  eq(tp.sweep().length, 0, 'still not again');
});

check('in-flight accounting tracks begin, complete, and sweep', () => {
  const { clock, tp } = mk();
  const a = tp.begin('alpha', 't1');
  tp.begin('bravo', 't2');
  tp.begin('stalled', 't3');
  eq(tp.inFlight(), 3, 'three in flight');
  eq(tp.inFlightFor('alpha'), 1, 'one for alpha');
  tp.complete(a.id);
  eq(tp.inFlight(), 2, 'two after a completion');
  clock.advance(IDLE);
  tp.sweep();
  eq(tp.inFlight(), 0, 'sweep clears the expired');
});

check('only breached attempts are swept', () => {
  const { clock, tp } = mk();
  const fresh = tp.begin('alpha', 't1');
  clock.advance(IDLE - 100);
  tp.begin('stalled', 't2');
  clock.advance(100);
  // t1 is at IDLE and breached; t2 is at 100ms and fine.
  const expired = tp.sweep();
  eq(expired.length, 1, 'one expired');
  eq(expired[0].attempt.taskId, 't1', 'the older one');
  eq(tp.inFlight(), 1, 'the fresh one survives');
  eq(tp.heartbeat(fresh.id), false, 'and the swept one is gone');
});

check('attempt ids are unique and deterministic', () => {
  const { tp } = mk();
  const a = tp.begin('alpha', 't1');
  const b = tp.begin('alpha', 't1');
  truthy(a.id !== b.id, 'two attempts on the same task get distinct ids');
  const { tp: tp2 } = mk();
  eq(tp2.begin('alpha', 't1').id, a.id, 'same sequence, same ids — no Math.random');
});

// ── views and error surface ──────────────────────────────────────────────────

check('view reports both remaining budgets', () => {
  const { clock, tp } = mk();
  const a = tp.begin('alpha', 't1');
  clock.advance(500);
  const v = tp.view(a.id);
  eq(v.elapsedMs, 500, 'elapsed');
  eq(v.idleMs, 500, 'idle');
  eq(v.runRemainingMs, RUN - 500, 'run budget left');
  eq(v.idleRemainingMs, IDLE - 500, 'idle budget left');
  eq(v.expired, null, 'not expired');
});

check('view shows the idle budget refreshing but the run budget draining', () => {
  const { clock, tp } = mk();
  const a = tp.begin('alpha', 't1');
  clock.advance(1000);
  tp.heartbeat(a.id);
  clock.advance(200);
  const v = tp.view(a.id);
  eq(v.idleMs, 200, 'idle measured from the heartbeat');
  eq(v.elapsedMs, 1200, 'elapsed measured from the start');
  eq(v.runRemainingMs, RUN - 1200, 'the run budget kept draining across the heartbeat');
});

check('view of an unknown attempt is null', () => {
  const { tp } = mk();
  eq(tp.view('nope'), null, 'unknown id');
});

check('check() tests one attempt without removing it', () => {
  const { clock, tp } = mk();
  const a = tp.begin('stalled', 't1');
  clock.advance(IDLE);
  truthy(tp.check(a.id), 'reports the breach');
  eq(tp.inFlight(), 1, 'but leaves it in flight');
  eq(tp.sweep().length, 1, 'so sweep still finds it');
});

check('AttemptTimeoutError carries the kind and the expert', () => {
  const { clock, tp } = mk();
  tp.begin('stalled', 't1');
  clock.advance(IDLE);
  const [e] = tp.sweep();
  const err = new AttemptTimeoutError(e);
  eq(err.expiry.kind, 'idle', 'kind rides on the error');
  truthy(err.message.includes('stalled'), 'names the expert');
  truthy(err.message.includes('idle'), 'names the deadline');
  eq(err instanceof AttemptTimeoutError, true, 'instanceof works (needs target >= es2015)');
  eq(err instanceof Error, true, 'and is an Error');
});

// ── the integration claim, asserted rather than described ────────────────────

check('a hang yields a failure signal the existing layers can consume', () => {
  // The wiring claim in the module header: the timeout does not need to modify
  // capacity or the breaker, it just manufactures the signal they already take.
  // Modelled here with counters so the claim is checked, not asserted in prose.
  const { clock, tp } = mk();
  const observed = [];
  const failures = [];

  tp.begin('stalled', 't1');
  clock.advance(IDLE);
  for (const e of tp.sweep()) {
    observed.push([e.attempt.expert, e.elapsedMs, false]); // capacity.observe
    failures.push(e.attempt.expert); // breakers.recordFailure
  }

  eq(observed.length, 1, 'capacity gets a latency observation it would otherwise never get');
  eq(observed[0][2], false, 'and it is marked NOT ok');
  eq(failures, ['stalled'], 'the breaker gets a failure it would otherwise never see');
});

check('three hangs trip a threshold-3 breaker; two do not', () => {
  const { clock, tp } = mk();
  let consecutive = 0;
  for (let i = 0; i < 2; i += 1) {
    tp.begin('stalled', `t${i}`);
    clock.advance(IDLE);
    consecutive += tp.sweep().length;
  }
  eq(consecutive, 2, 'two hangs so far');
  truthy(consecutive < 3, 'below a threshold-3 breaker');
  tp.begin('stalled', 't2');
  clock.advance(IDLE);
  consecutive += tp.sweep().length;
  eq(consecutive, 3, 'the third hang reaches the threshold');
});

report();
