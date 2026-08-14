#!/usr/bin/env node
// scripts/harness-consensus-test.mjs — Sprint B: fault-tolerant consensus.
//
// Run: node scripts/harness-consensus-test.mjs

import { compileHarness, createChecker } from './lib/harness-compile.mjs';

const { load } = compileHarness();
const { ManualClock } = await load('types');
const { CircuitBreakerRegistry, CircuitOpenError } = await load('circuit-breaker');
const { QuorumEvaluator, scoreAgainstRubric, aggregatePanel } = await load('quorum');
const { MemoryCheckpointStore, ReplayController } = await load('replay');

const { check, eq, truthy, close, report } = createChecker('harness-consensus');

// Async checks need awaiting; collect and run them with the same reporter.
const asyncChecks = [];
const acheck = (name, fn) => asyncChecks.push([name, fn]);

// ── circuit breaker ──────────────────────────────────────────────────────────

const mkBreaker = (over = {}) => {
  const clock = new ManualClock(0);
  return {
    clock,
    cb: new CircuitBreakerRegistry(clock, {
      thresholdFailures: 3,
      resetTimeoutMs: 1000,
      successesToClose: 2,
      ...over,
    }),
  };
};

check('breaker starts closed', () => {
  const { cb } = mkBreaker();
  eq(cb.state('a'), 'closed', 'initial state');
  eq(cb.isOpen('a'), false, 'not open');
});

check('breaker opens on the threshold, not before', () => {
  const { cb } = mkBreaker();
  cb.recordFailure('a');
  cb.recordFailure('a');
  eq(cb.state('a'), 'closed', 'still closed at 2/3');
  cb.recordFailure('a');
  eq(cb.state('a'), 'open', 'open at 3/3');
});

check('a success resets the failure count', () => {
  const { cb } = mkBreaker();
  cb.recordFailure('a');
  cb.recordFailure('a');
  cb.recordSuccess('a');
  cb.recordFailure('a');
  cb.recordFailure('a');
  eq(cb.state('a'), 'closed', 'the run was broken, so the count restarted');
});

check('breaker half-opens only after the reset timeout', () => {
  const { cb, clock } = mkBreaker();
  for (let i = 0; i < 3; i += 1) cb.recordFailure('a');
  clock.advance(999);
  eq(cb.state('a'), 'open', 'still open just before the timeout');
  clock.advance(2);
  eq(cb.state('a'), 'half_open', 'half-open after it');
});

check('HALF-OPEN ADMITS ONE PROBE — the backlog does not stampede', () => {
  const { cb, clock } = mkBreaker();
  for (let i = 0; i < 3; i += 1) cb.recordFailure('a');
  clock.advance(1001);
  eq(cb.isOpen('a'), false, 'first caller is admitted as the probe');
});

check('closing from half-open needs the configured probe successes', () => {
  const { cb, clock } = mkBreaker();
  for (let i = 0; i < 3; i += 1) cb.recordFailure('a');
  clock.advance(1001);
  cb.recordSuccess('a');
  eq(cb.state('a'), 'half_open', 'one success is not enough');
  cb.recordSuccess('a');
  eq(cb.state('a'), 'closed', 'two successes close it');
});

check('a failed probe returns to open immediately', () => {
  const { cb, clock } = mkBreaker();
  for (let i = 0; i < 3; i += 1) cb.recordFailure('a');
  clock.advance(1001);
  eq(cb.state('a'), 'half_open', 'half-open');
  cb.recordFailure('a');
  eq(cb.state('a'), 'open', 'straight back to open, no lingering');
});

check('trip() forces open from any state', () => {
  const { cb } = mkBreaker();
  cb.trip('a');
  eq(cb.state('a'), 'open', 'forced open');
});

check('breaker view explains itself', () => {
  const { cb } = mkBreaker();
  cb.recordFailure('a');
  truthy(cb.view('a').basis.includes('1/3'), 'basis names the progress toward the threshold');
});

acheck('execute() runs the primary while closed and labels it', async () => {
  const { cb } = mkBreaker();
  const r = await cb.execute('a', async () => 'primary', async () => 'fallback');
  eq(r.value, 'primary', 'value');
  eq(r.viaFallback, false, 'not a fallback');
  eq(r.expert, 'a', 'attributed to the expert');
});

acheck('execute() diverts to the fallback when open, and LABELS it', async () => {
  const { cb } = mkBreaker();
  cb.trip('a');
  const r = await cb.execute('a', async () => 'primary', async () => 'fallback');
  eq(r.value, 'fallback', 'value');
  eq(r.viaFallback, true, 'labelled as a fallback');
  eq(r.expert, 'fallback', 'not attributed to the expert');
});

acheck('a fallback success does NOT credit the expert', async () => {
  const { cb } = mkBreaker();
  cb.trip('a');
  await cb.execute('a', async () => 'primary', async () => 'fallback');
  eq(cb.state('a'), 'open', 'breaker unchanged — the expert proved nothing');
});

acheck('a thrown primary counts as a failure and falls back', async () => {
  const { cb } = mkBreaker({ thresholdFailures: 1 });
  const r = await cb.execute(
    'a',
    async () => {
      throw new Error('boom');
    },
    async () => 'fallback'
  );
  eq(r.viaFallback, true, 'fell back');
  eq(cb.state('a'), 'open', 'failure recorded');
});

acheck('an open breaker with no fallback throws CircuitOpenError', async () => {
  const { cb } = mkBreaker();
  cb.trip('a');
  let caught = null;
  try {
    await cb.execute('a', async () => 'primary');
  } catch (e) {
    caught = e;
  }
  truthy(caught instanceof CircuitOpenError, 'typed error, so callers can branch on it');
});

// ── quorum ───────────────────────────────────────────────────────────────────

const v = (id, verdict, earnedScore = 5000) => ({ validator: id, verdict, earnedScore });
const mkQuorum = (over = {}) => new QuorumEvaluator(new ManualClock(0), over);

check('unanimous approval commits', () => {
  const q = mkQuorum();
  const r = q.evaluate([v('a', 'approve'), v('b', 'approve'), v('c', 'approve'), v('d', 'approve')]);
  eq(r.outcome, 'COMMIT', 'outcome');
  eq(r.agreementShare, 1, 'share');
});

check('unanimous rejection rejects', () => {
  const q = mkQuorum();
  const r = q.evaluate([v('a', 'reject'), v('b', 'reject'), v('c', 'reject'), v('d', 'reject')]);
  eq(r.outcome, 'REJECT', 'outcome');
});

check('a bare majority is NOT a supermajority', () => {
  // 3:2 is 60%, under the 66.7% bar. (3:1 would be 75% and correctly commits —
  // an earlier draft of this test used 3:1 and asserted INDETERMINATE, which
  // was the test being wrong rather than the evaluator.)
  const q = mkQuorum({ minValidators: 4, faultTolerance: 1 });
  const r = q.evaluate([
    v('a', 'approve'),
    v('b', 'approve'),
    v('c', 'approve'),
    v('d', 'reject'),
    v('e', 'reject'),
  ]);
  eq(r.outcome, 'INDETERMINATE', '60% does not clear the bar');
  truthy(r.safetyMargin < 0, 'negative margin reported');
});

check('3:1 DOES commit — the bar is 2/3, not unanimity', () => {
  const q = mkQuorum();
  const r = q.evaluate([v('a', 'approve'), v('b', 'approve'), v('c', 'approve'), v('d', 'reject')]);
  eq(r.outcome, 'COMMIT', '75% clears 66.7%');
  truthy(r.safetyMargin > 0, 'positive margin');
});

check('supermajority bar is strict: exactly 2/3 does not clear it', () => {
  const q = mkQuorum({ minValidators: 3, faultTolerance: 0 });
  const r = q.evaluate([v('a', 'approve'), v('b', 'approve'), v('c', 'reject')]);
  eq(r.outcome, 'INDETERMINATE', 'exactly 2/3 is not "> 2/3"');
  truthy(r.safetyMargin <= 0, 'margin is zero or negative');
});

check('TOO FEW VALIDATORS IS INDETERMINATE, NOT REJECT', () => {
  // The core epistemic rule. Two-valued consensus records an infrastructure
  // failure as a decision against the proposal.
  const q = mkQuorum({ minValidators: 4 });
  const r = q.evaluate([v('a', 'approve'), v('b', 'approve')]);
  eq(r.outcome, 'INDETERMINATE', 'outcome');
  truthy(r.basis.includes('NOT a rejection'), 'basis says so explicitly');
});

check('PBFT structural floor n >= 3f+1 is enforced', () => {
  const q = mkQuorum({ minValidators: 2, faultTolerance: 1 }); // needs 4
  const r = q.evaluate([v('a', 'approve'), v('b', 'approve'), v('c', 'approve')]);
  eq(r.outcome, 'INDETERMINATE', '3 validators cannot tolerate f=1');
  truthy(r.basis.includes('3f+1'), 'basis names the structural requirement');
});

check('f=1 is satisfiable at exactly 4 validators', () => {
  const q = mkQuorum({ minValidators: 2, faultTolerance: 1 });
  const r = q.evaluate([v('a', 'approve'), v('b', 'approve'), v('c', 'approve'), v('d', 'reject')]);
  eq(r.outcome, 'COMMIT', '75% of deciding weight clears the bar at n=4');
});

check('a split panel is INDETERMINATE, not a rejection', () => {
  const q = mkQuorum({ minValidators: 4, faultTolerance: 0 });
  const r = q.evaluate([v('a', 'approve'), v('b', 'approve'), v('c', 'reject'), v('d', 'reject')]);
  eq(r.outcome, 'INDETERMINATE', '50/50');
  truthy(r.basis.includes('NOT a rejection'), 'stated plainly');
});

check('votes are weighted by EARNED reputation', () => {
  const q = mkQuorum({ minValidators: 4, faultTolerance: 0 });
  const r = q.evaluate([
    v('trusted', 'approve', 10000),
    v('trusted2', 'approve', 10000),
    v('trusted3', 'approve', 10000),
    v('weak', 'reject', 100),
  ]);
  eq(r.outcome, 'COMMIT', 'high-reputation approvals dominate');
  truthy(r.agreementShare > 0.99, `share ${r.agreementShare}`);
});

check('abstentions are excluded from the denominator, not counted as rejections', () => {
  const q = mkQuorum({ minValidators: 3, faultTolerance: 0 });
  const r = q.evaluate([
    v('a', 'approve'),
    v('b', 'approve'),
    v('c', 'approve'),
    v('d', 'abstain'),
    v('e', 'abstain'),
  ]);
  eq(r.outcome, 'COMMIT', 'abstentions must not sink a unanimous deciding panel');
  eq(r.participatingValidators, 3, 'only deciding votes participate');
  truthy(r.abstainWeight > 0, 'abstain weight is still reported');
});

check('EQUIVOCATION: a double voter is discarded entirely', () => {
  const q = mkQuorum({ minValidators: 3, faultTolerance: 0 });
  const r = q.evaluate([
    v('cheat', 'approve'),
    v('cheat', 'reject'),
    v('a', 'approve'),
    v('b', 'approve'),
    v('c', 'approve'),
  ]);
  eq(r.equivocators, ['cheat'], 'named');
  eq(r.participatingValidators, 3, 'both of the equivocator votes dropped');
  eq(r.outcome, 'COMMIT', 'honest majority still decides');
});

check('all-zero earned weight is INDETERMINATE, not a 0/0 decision', () => {
  const q = mkQuorum({ minValidators: 3, faultTolerance: 0 });
  const r = q.evaluate([v('a', 'approve', 0), v('b', 'approve', 0), v('c', 'approve', 0)]);
  eq(r.outcome, 'INDETERMINATE', 'no weight means no conclusion');
});

check('earned scores are clamped into range', () => {
  const q = mkQuorum({ minValidators: 3, faultTolerance: 0 });
  const r = q.evaluate([
    v('a', 'approve', 999_999),
    v('b', 'approve', -500),
    v('c', 'approve', 5000),
  ]);
  truthy(r.approveWeight <= 30_000, `weight ${r.approveWeight} respects the 10000 cap per voter`);
});

check('safetyMargin reports real headroom', () => {
  const q = mkQuorum({ minValidators: 4, faultTolerance: 0 });
  const r = q.evaluate([v('a', 'approve'), v('b', 'approve'), v('c', 'approve'), v('d', 'approve')]);
  close(r.safetyMargin, 1 - 2 / 3, 1e-9, 'unanimous margin');
});

// ── rubric scoring ───────────────────────────────────────────────────────────

const RUBRIC = [
  { name: 'accuracy', weight: 3 },
  { name: 'grounding', weight: 2 },
];

check('a complete rubric produces a weighted score', () => {
  const r = scoreAgainstRubric(RUBRIC, { judge: 'j1', dimensions: { accuracy: 1, grounding: 0.5 } });
  eq(r.valid, true, 'valid');
  close(r.weighted, (1 * 3 + 0.5 * 2) / 5, 1e-9, 'weighted mean');
});

check('a MISSING dimension is an abstention, not a zero', () => {
  // Refusing the get_reward defect: absence of a score is not a bad score.
  const r = scoreAgainstRubric(RUBRIC, { judge: 'j1', dimensions: { accuracy: 1 } });
  eq(r.valid, false, 'invalid');
  truthy(r.reason.includes('abstention'), 'reason says abstention explicitly');
});

check('a non-numeric dimension is an abstention', () => {
  const r = scoreAgainstRubric(RUBRIC, {
    judge: 'j1',
    dimensions: { accuracy: 'excellent', grounding: 1 },
  });
  eq(r.valid, false, 'prose cannot satisfy a rubric');
});

check('NaN is rejected rather than propagating', () => {
  const r = scoreAgainstRubric(RUBRIC, { judge: 'j1', dimensions: { accuracy: NaN, grounding: 1 } });
  eq(r.valid, false, 'NaN caught');
});

check('an out-of-range score is rejected', () => {
  const r = scoreAgainstRubric(RUBRIC, { judge: 'j1', dimensions: { accuracy: 1.5, grounding: 1 } });
  eq(r.valid, false, 'above 1 rejected');
});

check('panel aggregates valid judges and excludes abstentions', () => {
  const p = aggregatePanel(RUBRIC, [
    { judge: 'j1', dimensions: { accuracy: 1, grounding: 1 } },
    { judge: 'j2', dimensions: { accuracy: 0.5, grounding: 0.5 } },
    { judge: 'j3', dimensions: { accuracy: 1 } }, // abstains
  ]);
  close(p.meanScore, 0.75, 1e-9, 'mean over the two valid judges');
  eq(p.validJudges, 2, 'valid count');
  eq(p.abstentions.length, 1, 'abstention recorded, not scored as 0');
});

check('a panel below the minimum reports NO mean at all', () => {
  const p = aggregatePanel(RUBRIC, [{ judge: 'j1', dimensions: { accuracy: 1, grounding: 1 } }], 2);
  eq(p.meanScore, null, 'one judge is not a panel');
  truthy(p.basis.includes('not a panel'), 'basis explains');
});

check('dispersion exposes judge disagreement', () => {
  const p = aggregatePanel(RUBRIC, [
    { judge: 'j1', dimensions: { accuracy: 1, grounding: 1 } },
    { judge: 'j2', dimensions: { accuracy: 0, grounding: 0 } },
  ]);
  close(p.meanScore, 0.5, 1e-9, 'mean hides the disagreement');
  close(p.dispersion, 1, 1e-9, 'dispersion reveals it');
});

// ── replay ───────────────────────────────────────────────────────────────────

acheck('a clean step returns ok without replaying', async () => {
  const clock = new ManualClock(0);
  const store = new MemoryCheckpointStore(clock);
  const rc = new ReplayController(clock, store, { maxReplays: 2 });
  const r = await rc.run('ns', { n: 1 }, async (s) => ({ n: s.n + 1 }), () => null);
  eq(r.status, 'ok', 'status');
  eq(r.state, { n: 2 }, 'state');
  eq(r.attempts, 1, 'no wasted attempts');
});

acheck('CORRUPT OUTPUT is caught even though the step did not throw', async () => {
  const clock = new ManualClock(0);
  const store = new MemoryCheckpointStore(clock);
  store.put('ns', { n: 0 }); // an earlier good checkpoint to rewind to
  const rc = new ReplayController(clock, store, { maxReplays: 2 });
  let calls = 0;
  const r = await rc.run(
    'ns',
    { n: 1 },
    async (s) => {
      calls += 1;
      return calls === 1 ? { n: -999 } : { n: s.n + 1 };
    },
    (s) => (s.n < 0 ? 'negative n is corrupt' : null)
  );
  eq(r.status, 'recovered', 'recovered rather than returning corruption');
  truthy(r.restoredFrom !== undefined, 'names the checkpoint it rewound to');
});

acheck('replay rewinds to BEFORE the failure, not to the latest checkpoint', async () => {
  const clock = new ManualClock(0);
  const store = new MemoryCheckpointStore(clock);
  store.put('ns', { n: 100 }); // the good prior state
  const rc = new ReplayController(clock, store, { maxReplays: 1 });
  const seen = [];
  await rc.run(
    'ns',
    { n: 1 }, // the anchor, written as a checkpoint on entry
    async (s) => {
      seen.push(s.n);
      return { n: -1 };
    },
    (s) => (s.n < 0 ? 'corrupt' : null)
  );
  eq(seen, [1, 100], 'second attempt used the pre-anchor state, not the anchor');
});

acheck('exhausting the budget is a NAMED terminal state, not an exception', async () => {
  const clock = new ManualClock(0);
  const store = new MemoryCheckpointStore(clock);
  store.put('ns', { n: 0 });
  const rc = new ReplayController(clock, store, { maxReplays: 2 });
  const r = await rc.run('ns', { n: 1 }, async () => ({ n: -1 }), () => 'always corrupt');
  eq(r.status, 'replay_exhausted', 'named state');
  eq(r.attempts, 3, 'initial attempt plus two replays');
  truthy(r.lastError.includes('always corrupt'), 'last error preserved');
});

acheck('no prior checkpoint reports no_checkpoint rather than burning the budget', async () => {
  const clock = new ManualClock(0);
  const store = new MemoryCheckpointStore(clock);
  const rc = new ReplayController(clock, store, { maxReplays: 5 });
  const r = await rc.run('ns', { n: 1 }, async () => ({ n: -1 }), () => 'corrupt');
  eq(r.status, 'no_checkpoint', 'distinct from exhaustion');
  eq(r.attempts, 2, 'stopped as soon as rewinding was impossible');
});

acheck('a thrown step is replayed like corrupt output', async () => {
  const clock = new ManualClock(0);
  const store = new MemoryCheckpointStore(clock);
  store.put('ns', { n: 7 });
  const rc = new ReplayController(clock, store, { maxReplays: 2 });
  let calls = 0;
  const r = await rc.run(
    'ns',
    { n: 1 },
    async (s) => {
      calls += 1;
      if (calls === 1) throw new Error('malformed tool call');
      return { n: s.n + 1 };
    },
    () => null
  );
  eq(r.status, 'recovered', 'recovered from a throw');
  eq(r.state, { n: 8 }, 'used the restored state');
});

acheck('failures are logged with attribution', async () => {
  const clock = new ManualClock(0);
  const store = new MemoryCheckpointStore(clock);
  store.put('ns', { n: 0 });
  const rc = new ReplayController(clock, store, { maxReplays: 1 });
  await rc.run('ns', { n: 1 }, async () => ({ n: -1 }), () => 'corrupt');
  eq(rc.failures.length, 2, 'both attempts logged');
  eq(rc.failures[0].namespace, 'ns', 'namespace recorded');
  truthy(rc.failures[0].error.includes('corrupt'), 'error recorded');
});

check('FIRST-VISIT semantics stop a loop from rewinding forever', () => {
  const clock = new ManualClock(0);
  const store = new MemoryCheckpointStore(clock);
  const rc = new ReplayController(clock, store, { maxReplays: 1 });
  eq(rc.isFirstVisit('sub'), true, 'first pass restores');
  eq(rc.isFirstVisit('sub'), false, 'second pass loads normally');
  rc.resetVisits();
  eq(rc.isFirstVisit('sub'), true, 'a new parent run restores again');
});

check('checkpoints are immutable once written', () => {
  const clock = new ManualClock(0);
  const store = new MemoryCheckpointStore(clock);
  const mutable = { n: 1 };
  store.put('ns', mutable);
  mutable.n = 999;
  eq(store.latest('ns').state, { n: 1 }, 'later mutation cannot rewrite history');
});

// ── run the async block, then report ─────────────────────────────────────────

for (const [name, fn] of asyncChecks) {
  try {
    await fn();
    check(name, () => {});
  } catch (e) {
    check(name, () => {
      throw e;
    });
  }
}

report();
