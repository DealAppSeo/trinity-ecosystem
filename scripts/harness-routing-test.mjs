#!/usr/bin/env node
// scripts/harness-routing-test.mjs — Sprint A: load balancing and routing.
//
// Run: node scripts/harness-routing-test.mjs
//
// Each named MoE failure mode this sprint claims to fix gets an assertion that
// would fail if the fix were removed. A test that passes with the feature
// deleted is not evidence.

import { compileHarness, createChecker } from './lib/harness-compile.mjs';

const { load } = compileHarness();
const { ManualClock, cosineSimilarity, BPS_MAX } = await load('types');
const { LeakyBucketLimiter } = await load('leaky-bucket');
const { CapacityGovernor } = await load('capacity');
const { TrustRouter, SeededRng } = await load('router');
const { PullQueue } = await load('queue');

const { check, eq, truthy, close, report } = createChecker('harness-routing');

const expert = (id, over = {}) => ({
  id,
  capabilities: ['hal'],
  earnedScore: 5000,
  coldStart: false,
  ...over,
});

// ── cosine similarity: degenerate cases must not produce NaN ────────────────

check('cosine handles absent, mismatched and zero vectors without NaN', () => {
  eq(cosineSimilarity(undefined, [1, 2]), 0, 'absent');
  eq(cosineSimilarity([1, 2], [1, 2, 3]), 0, 'length mismatch');
  eq(cosineSimilarity([0, 0], [1, 1]), 0, 'zero magnitude');
  eq(cosineSimilarity([], []), 0, 'empty');
});

check('cosine is 1 for identical and -1 for opposite vectors', () => {
  close(cosineSimilarity([1, 0], [1, 0]), 1, 1e-9, 'identical');
  close(cosineSimilarity([1, 0], [-1, 0]), -1, 1e-9, 'opposite');
  close(cosineSimilarity([1, 0], [0, 1]), 0, 1e-9, 'orthogonal');
});

check('cosine stays within [-1, 1] under float drift', () => {
  const v = [0.1, 0.2, 0.3, 0.4];
  const s = cosineSimilarity(v, v);
  truthy(s <= 1 && s >= -1, `similarity ${s} escaped [-1,1]`);
});

// ── leaky bucket ─────────────────────────────────────────────────────────────

check('bucket admits within budget and refuses beyond it', () => {
  const clock = new ManualClock(0);
  const l = new LeakyBucketLimiter(clock, { tokensPerMinute: 100 });
  eq(l.tryConsume('a', 60).admitted, true, 'first charge');
  eq(l.tryConsume('a', 40).admitted, true, 'second charge exhausts');
  eq(l.tryConsume('a', 1).admitted, false, 'third refused');
});

check('bucket refills continuously, not on ticks', () => {
  const clock = new ManualClock(0);
  const l = new LeakyBucketLimiter(clock, { tokensPerMinute: 60 }); // 1/sec
  l.tryConsume('a', 60);
  eq(l.available('a'), 0, 'drained');
  clock.advance(500); // half a second -> half a token, not zero
  close(l.available('a'), 0.5, 1e-9, 'partial refill mid-interval');
  clock.advance(9500);
  close(l.available('a'), 10, 1e-9, 'ten seconds -> ten tokens');
});

check('bucket never refills past capacity', () => {
  const clock = new ManualClock(0);
  const l = new LeakyBucketLimiter(clock, { tokensPerMinute: 100 });
  clock.advance(60 * 60 * 1000);
  eq(l.available('a'), 100, 'capped at capacity after an hour idle');
});

check('retryAfterMs is the real wait, not a guess', () => {
  const clock = new ManualClock(0);
  const l = new LeakyBucketLimiter(clock, { tokensPerMinute: 60 });
  l.tryConsume('a', 60);
  const r = l.tryConsume('a', 30);
  eq(r.admitted, false, 'refused');
  eq(r.retryAfterMs, 30_000, 'exactly 30s at 1 token/sec');
  clock.advance(30_000);
  eq(l.tryConsume('a', 30).admitted, true, 'admitted after the stated wait');
});

check('a request larger than capacity is refused with no retry time', () => {
  const clock = new ManualClock(0);
  const l = new LeakyBucketLimiter(clock, { tokensPerMinute: 10 });
  const r = l.tryConsume('a', 500);
  eq(r.admitted, false, 'refused');
  eq(r.retryAfterMs, undefined, 'no retryAfterMs — waiting cannot help');
});

check('a backwards clock does not drain the bucket', () => {
  const clock = new ManualClock(10_000);
  const l = new LeakyBucketLimiter(clock, { tokensPerMinute: 60 });
  l.tryConsume('a', 30);
  const before = l.available('a');
  clock.set(0);
  truthy(l.available('a') >= before, 'tokens must not go backwards on clock skew');
});

check('reconfigure clamps rather than granting free capacity', () => {
  const clock = new ManualClock(0);
  const l = new LeakyBucketLimiter(clock, { tokensPerMinute: 100 });
  l.tryConsume('a', 90);
  l.configure('a', { tokensPerMinute: 50 });
  truthy(l.available('a') <= 50, 'clamped to the new ceiling');
  close(l.available('a'), 10, 1e-9, 'kept the 10 remaining, not reset to 50');
});

check('congestion rises from 0 to 1 as the bucket drains', () => {
  const clock = new ManualClock(0);
  const l = new LeakyBucketLimiter(clock, { tokensPerMinute: 100 });
  eq(l.congestion('a'), 0, 'full bucket is uncongested');
  l.tryConsume('a', 50);
  close(l.congestion('a'), 0.5, 1e-9, 'half drained');
  l.tryConsume('a', 50);
  eq(l.congestion('a'), 1, 'fully drained');
});

// ── capacity governor ────────────────────────────────────────────────────────

check('capacity warms up before it judges', () => {
  const clock = new ManualClock(0);
  const c = new CapacityGovernor(clock, { baseSlots: 4, minSlots: 1, maxSlots: 8, warmupSamples: 5 });
  c.observe('a', 100);
  eq(c.health('a'), 'warming', 'health while warming');
  eq(c.slots('a'), 4, 'base slots while warming, not starved');
});

check('slots shrink as latency rises above baseline', () => {
  const clock = new ManualClock(0);
  const c = new CapacityGovernor(clock, { baseSlots: 8, minSlots: 1, maxSlots: 16, warmupSamples: 3, alpha: 1 });
  for (let i = 0; i < 3; i += 1) c.observe('a', 100);
  eq(c.health('a'), 'healthy', 'healthy at baseline');
  eq(c.slots('a'), 8, 'full slots at baseline');
  for (let i = 0; i < 5; i += 1) c.observe('a', 400); // 4x baseline
  eq(c.health('a'), 'degraded', 'degraded at 4x');
  truthy(c.slots('a') < 8, `slots must shrink, got ${c.slots('a')}`);
  eq(c.slots('a'), 2, '8 slots / 4x ratio');
});

check('baseline is NOT re-learned while degraded', () => {
  // The failure this guards: an expert that slows permanently teaches the
  // governor that slow is normal, and the degradation becomes invisible.
  const clock = new ManualClock(0);
  const c = new CapacityGovernor(clock, { baseSlots: 8, minSlots: 1, maxSlots: 16, warmupSamples: 3, alpha: 1 });
  for (let i = 0; i < 3; i += 1) c.observe('a', 100);
  const baseline = c.view('a').baselineLatencyMs;
  for (let i = 0; i < 50; i += 1) c.observe('a', 500);
  eq(c.view('a').baselineLatencyMs, baseline, 'baseline must not drift to the degraded value');
  eq(c.health('a'), 'degraded', 'still reported degraded after 50 slow samples');
});

check('explicit rebaseline is the only way to move the baseline', () => {
  const clock = new ManualClock(0);
  const c = new CapacityGovernor(clock, { baseSlots: 8, minSlots: 1, maxSlots: 16, warmupSamples: 3, alpha: 1 });
  for (let i = 0; i < 3; i += 1) c.observe('a', 100);
  for (let i = 0; i < 5; i += 1) c.observe('a', 500);
  c.rebaseline('a');
  eq(c.health('a'), 'healthy', 'healthy after an explicit rebaseline');
});

check('consecutive errors degrade an expert even at good latency', () => {
  const clock = new ManualClock(0);
  const c = new CapacityGovernor(clock, { baseSlots: 8, minSlots: 1, maxSlots: 16, warmupSamples: 3, alpha: 1 });
  for (let i = 0; i < 3; i += 1) c.observe('a', 100);
  for (let i = 0; i < 3; i += 1) c.observe('a', 100, false);
  eq(c.health('a'), 'degraded', 'fast but failing is still degraded');
  truthy(c.slots('a') < 8, 'slots reduced on errors');
});

check('a success run clears the error count', () => {
  const clock = new ManualClock(0);
  const c = new CapacityGovernor(clock, { baseSlots: 8, minSlots: 1, maxSlots: 16, warmupSamples: 3, alpha: 1 });
  for (let i = 0; i < 3; i += 1) c.observe('a', 100);
  for (let i = 0; i < 3; i += 1) c.observe('a', 100, false);
  c.observe('a', 100, true);
  eq(c.health('a'), 'healthy', 'recovered after a success');
});

check('slots never fall below minSlots — a degraded expert can still prove recovery', () => {
  const clock = new ManualClock(0);
  const c = new CapacityGovernor(clock, { baseSlots: 8, minSlots: 2, maxSlots: 16, warmupSamples: 2, alpha: 1 });
  c.observe('a', 10);
  c.observe('a', 10);
  for (let i = 0; i < 20; i += 1) c.observe('a', 100_000, false);
  truthy(c.slots('a') >= 2, `slots ${c.slots('a')} must respect minSlots`);
});

check('acquire refuses past the slot allowance and release frees one', () => {
  const clock = new ManualClock(0);
  const c = new CapacityGovernor(clock, { baseSlots: 2, minSlots: 1, maxSlots: 4 });
  eq(c.acquire('a'), true, 'slot 1');
  eq(c.acquire('a'), true, 'slot 2');
  eq(c.acquire('a'), false, 'slot 3 refused');
  c.release('a');
  eq(c.acquire('a'), true, 'freed slot reusable');
});

// ── stranded slots (Sprint K) ────────────────────────────────────────────────
//
// The whole point: abandoning a call is not the same as ending it. Every
// assertion below fails if `strand` is implemented as `release`.

check('a stranded slot is NOT free — abandoning a call does not end it', () => {
  const clock = new ManualClock(0);
  const c = new CapacityGovernor(clock, { baseSlots: 2, minSlots: 1, maxSlots: 4 });
  c.acquire('a');
  c.acquire('a');
  c.strand('a'); // gave up waiting; the expert may still be running it
  eq(c.inFlight('a'), 1, 'no longer awaiting it');
  eq(c.stranded('a'), 1, 'but still claimed');
  eq(c.committed('a'), 2, 'committed is unchanged by giving up');
  eq(c.available('a'), 0, 'so there is no headroom');
  eq(c.acquire('a'), false, 'and the slot cannot be handed out a second time');
});

check('reclaim is what frees a stranded slot, and only reclaim', () => {
  const clock = new ManualClock(0);
  const c = new CapacityGovernor(clock, { baseSlots: 2, minSlots: 1, maxSlots: 4 });
  c.acquire('a');
  c.acquire('a');
  c.strand('a');
  clock.advance(1_000_000); // time alone must not launder a stranded slot
  eq(c.available('a'), 0, 'a stranded slot does not expire on its own');
  c.reclaim('a');
  eq(c.stranded('a'), 0, 'confirmed dead');
  eq(c.available('a'), 1, 'now there is headroom');
  eq(c.acquire('a'), true, 'and it is admittable');
});

check('stranding does not reduce the expert rated slot count', () => {
  const clock = new ManualClock(0);
  const c = new CapacityGovernor(clock, { baseSlots: 4, minSlots: 1, maxSlots: 8 });
  const before = c.slots('a');
  c.acquire('a');
  c.strand('a');
  eq(c.slots('a'), before, 'capability is unchanged; only the claim on it moved');
});

check('strand with nothing in flight is a no-op, not a negative claim', () => {
  const clock = new ManualClock(0);
  const c = new CapacityGovernor(clock, { baseSlots: 2, minSlots: 1, maxSlots: 4 });
  c.strand('a');
  eq(c.stranded('a'), 0, 'nothing was in flight to strand');
  eq(c.inFlight('a'), 0, 'and in-flight did not go negative');
  c.acquire('a');
  c.reclaim('a');
  c.reclaim('a');
  eq(c.stranded('a'), 0, 'over-reclaiming floors at zero');
  eq(c.inFlight('a'), 1, 'and does not steal from in-flight');
});

check('view reports the stranded/committed/available split', () => {
  const clock = new ManualClock(0);
  const c = new CapacityGovernor(clock, { baseSlots: 4, minSlots: 1, maxSlots: 8 });
  c.acquire('a');
  c.acquire('a');
  c.strand('a');
  const v = c.view('a');
  eq(v.stranded, 1, 'stranded surfaced');
  eq(v.committed, 2, 'committed surfaced');
  eq(v.available, 2, 'available surfaced');
  truthy(/stranded/.test(v.basis), `basis must name the stranding, got: ${v.basis}`);
});

// ── router ───────────────────────────────────────────────────────────────────

function harness(overrides = {}, seed = 42) {
  const clock = new ManualClock(0);
  const limiter = new LeakyBucketLimiter(clock, { tokensPerMinute: 1000 });
  const capacity = new CapacityGovernor(clock, { baseSlots: 4, minSlots: 1, maxSlots: 8 });
  const router = new TrustRouter(clock, limiter, capacity, overrides, new SeededRng(seed));
  return { clock, limiter, capacity, router };
}

check('router prefers higher EARNED reputation, all else equal', () => {
  const { router } = harness({ explorationRate: 0 });
  const d = router.route({ id: 't1', requires: ['hal'] }, [
    expert('low', { earnedScore: 2000 }),
    expert('high', { earnedScore: 9000 }),
  ]);
  eq(d.selected, 'high', 'selected');
});

check('perceivedScore CANNOT move a ranking', () => {
  // The swarms defect, refused: self-reported/unearned standing must not rank.
  const { router } = harness({ explorationRate: 0 });
  const d = router.route({ id: 't1', requires: ['hal'] }, [
    expert('humble', { earnedScore: 9000, perceivedScore: 0 }),
    expert('boastful', { earnedScore: 2000, perceivedScore: BPS_MAX }),
  ]);
  eq(d.selected, 'humble', 'earned wins over a maximal perceived claim');
});

check('missing capability is a rejection, not a low score', () => {
  const { router } = harness({ explorationRate: 0 });
  const d = router.route({ id: 't1', requires: ['zk'] }, [expert('a'), expert('b', { capabilities: ['zk'] })]);
  eq(d.selected, 'b', 'only the capable expert is eligible');
  eq(d.scores.length, 1, 'ineligible experts are not scored');
  eq(d.rejected[0].reason, 'missing_capability', 'rejection reason');
});

check('congestion spreads load before the hard limit bites', () => {
  const { router, limiter } = harness({ explorationRate: 0, congestionWeight: 2 });
  limiter.configure('busy', { tokensPerMinute: 100 });
  limiter.configure('idle', { tokensPerMinute: 100 });
  limiter.tryConsume('busy', 95); // congested but NOT rate-limited yet
  const d = router.route({ id: 't1', requires: ['hal'] }, [
    expert('busy', { earnedScore: 9000 }),
    expert('idle', { earnedScore: 6000 }),
  ]);
  eq(d.selected, 'idle', 'the less congested expert wins despite lower trust');
  eq(d.rejected.length, 0, 'and nothing was hard-rejected — this is a soft penalty');
});

check('rate-limited experts are rejected with a reason', () => {
  const { router, limiter } = harness({ explorationRate: 0 });
  limiter.configure('a', { tokensPerMinute: 10 });
  limiter.tryConsume('a', 10);
  const d = router.route({ id: 't1', requires: ['hal'], estimatedTokens: 5 }, [expert('a')]);
  eq(d.selected, null, 'unroutable');
  eq(d.unroutableReason, 'rate_limited', 'reason surfaced');
});

check('at-capacity experts are rejected with a reason', () => {
  const { router, capacity } = harness({ explorationRate: 0 });
  for (let i = 0; i < 4; i += 1) capacity.acquire('a');
  const d = router.route({ id: 't1', requires: ['hal'] }, [expert('a')]);
  eq(d.unroutableReason, 'at_capacity', 'reason surfaced');
});

check('an expert whose slots are all STRANDED is refused work', () => {
  // The phantom-slot bug in one assertion. Before Sprint K the router measured
  // `inFlight`, which a strand decrements — so a hung expert looked idle and
  // kept being handed tasks. This fails if the gate goes back to `inFlight`.
  const { router, capacity } = harness({ explorationRate: 0 });
  for (let i = 0; i < 4; i += 1) capacity.acquire('a');
  for (let i = 0; i < 4; i += 1) capacity.strand('a');
  eq(capacity.inFlight('a'), 0, 'nothing is being awaited — the naive view of "idle"');
  const d = router.route({ id: 't1', requires: ['hal'] }, [expert('a')]);
  eq(d.selected, null, 'but it must not be routed to');
  eq(d.unroutableReason, 'at_capacity', 'reason surfaced');
  truthy(
    /stranded/.test(d.rejected[0].detail),
    `the rejection must say WHY it looks idle, got: ${d.rejected[0].detail}`
  );
});

check('routing resumes once the stranded slots are reclaimed', () => {
  // The other half: stranding must not be a one-way door that permanently
  // zeroes an expert. That would trade a phantom slot for a phantom outage.
  const { router, capacity } = harness({ explorationRate: 0 });
  for (let i = 0; i < 4; i += 1) capacity.acquire('a');
  for (let i = 0; i < 4; i += 1) capacity.strand('a');
  for (let i = 0; i < 4; i += 1) capacity.reclaim('a');
  const d = router.route({ id: 't1', requires: ['hal'] }, [expert('a')]);
  eq(d.selected, 'a', 'the expert is routable again');
});

check('open circuits are excluded from candidacy', () => {
  const { router } = harness({ explorationRate: 0 });
  const d = router.route({ id: 't1', requires: ['hal'] }, [expert('a'), expert('b')], {
    isCircuitOpen: (id) => id === 'a',
  });
  eq(d.selected, 'b', 'selected the closed-circuit expert');
  truthy(
    d.rejected.some((r) => r.expert === 'a' && r.reason === 'circuit_open'),
    'rejection recorded'
  );
});

check('top-K alternates are returned so failover need not re-rank', () => {
  const { router } = harness({ explorationRate: 0, alternatesCount: 2 });
  const d = router.route({ id: 't1', requires: ['hal'] }, [
    expert('a', { earnedScore: 9000 }),
    expert('b', { earnedScore: 8000 }),
    expert('c', { earnedScore: 7000 }),
    expert('d', { earnedScore: 6000 }),
  ]);
  eq(d.selected, 'a', 'best');
  eq(d.alternates, ['b', 'c'], 'ranked alternates, capped at alternatesCount');
});

check('caller exclusion supports failover to the next expert', () => {
  const { router } = harness({ explorationRate: 0 });
  const d = router.route({ id: 't1', requires: ['hal'] }, [
    expert('a', { earnedScore: 9000 }),
    expert('b', { earnedScore: 8000 }),
  ], { exclude: ['a'] });
  eq(d.selected, 'b', 'failover target');
});

check('COLD START: a new expert is never permanently ignored', () => {
  // The named failure: "New or rarely used agents lack robust performance
  // feedback, leading the router to permanently ignore them."
  const { router } = harness({ explorationRate: 1.0 });
  const d = router.route({ id: 't1', requires: ['hal'] }, [
    expert('veteran', { earnedScore: BPS_MAX }),
    expert('newcomer', { earnedScore: 0, coldStart: true }),
  ]);
  eq(d.selected, 'newcomer', 'exploration selects the cold-start expert');
  eq(d.scores.find((s) => s.expert === 'newcomer').exploration, true, 'flagged as exploration');
});

check('cold-start experts are scored at the midpoint, not zero', () => {
  const { router } = harness({ explorationRate: 0 });
  const d = router.route({ id: 't1', requires: ['hal'] }, [expert('new', { earnedScore: 0, coldStart: true })]);
  eq(d.scores[0].trustWeight, 0.5, 'no evidence is not evidence of badness');
});

check('the trust floor never excludes a cold-start expert', () => {
  const { router } = harness({ explorationRate: 0, trustFloor: 5000 });
  const d = router.route({ id: 't1', requires: ['hal'] }, [expert('new', { earnedScore: 0, coldStart: true })]);
  eq(d.selected, 'new', 'a self-fulfilling floor would make this null');
});

check('the trust floor DOES exclude an observed low scorer', () => {
  const { router } = harness({ explorationRate: 0, trustFloor: 5000 });
  const d = router.route({ id: 't1', requires: ['hal'] }, [expert('bad', { earnedScore: 100 })]);
  eq(d.selected, null, 'excluded');
  eq(d.unroutableReason, 'below_trust_floor', 'reason');
});

check('exploration rate is honoured statistically', () => {
  let explorations = 0;
  const trials = 400;
  for (let i = 0; i < trials; i += 1) {
    const { router } = harness({ explorationRate: 0.25 }, i + 1);
    const d = router.route({ id: `t${i}`, requires: ['hal'] }, [
      expert('veteran', { earnedScore: BPS_MAX }),
      expert('newcomer', { earnedScore: 0, coldStart: true }),
    ]);
    if (d.selected === 'newcomer') explorations += 1;
  }
  const rate = explorations / trials;
  close(rate, 0.25, 0.06, `observed exploration rate ${rate.toFixed(3)}`);
});

check('routing is deterministic for a fixed seed', () => {
  const run = () => {
    const { router } = harness({ explorationRate: 0.5 }, 7);
    return router.route({ id: 't1', requires: ['hal'] }, [
      expert('a', { earnedScore: 9000 }),
      expert('b', { earnedScore: 0, coldStart: true }),
    ]).selected;
  };
  eq(run(), run(), 'same seed, same decision');
});

check('ties break on expert id, so input order cannot change the winner', () => {
  const { router } = harness({ explorationRate: 0 });
  const forward = router.route({ id: 't', requires: ['hal'] }, [expert('a'), expert('b')]).selected;
  const reverse = router.route({ id: 't', requires: ['hal'] }, [expert('b'), expert('a')]).selected;
  eq(forward, reverse, 'stable under reordering');
});

check('ATTRIBUTION: a decision carries every input that produced it', () => {
  const { router, limiter } = harness({ explorationRate: 0 });
  limiter.configure('rl', { tokensPerMinute: 1 });
  limiter.tryConsume('rl', 1);
  const d = router.route({ id: 't1', requires: ['hal'], estimatedTokens: 5 }, [
    expert('ok', { earnedScore: 7000 }),
    expert('rl'),
    expert('nocap', { capabilities: [] }),
  ]);
  eq(d.selected, 'ok', 'selected');
  eq(d.rejected.length, 2, 'both exclusions recorded');
  truthy(d.scores[0].similarity !== undefined, 'similarity recorded');
  truthy(d.scores[0].congestionPenalty !== undefined, 'congestion recorded');
  truthy(d.decidedAt !== undefined, 'timestamp recorded');
});

check('embedding similarity outranks capability overlap when provided', () => {
  const { router } = harness({ explorationRate: 0, trustWeight: 0 });
  const d = router.route({ id: 't1', requires: ['hal'], embedding: [1, 0] }, [
    expert('aligned', { embedding: [1, 0] }),
    expert('orthogonal', { embedding: [0, 1] }),
  ]);
  eq(d.selected, 'aligned', 'embedding drives the choice');
});

// ── pull queue ───────────────────────────────────────────────────────────────

check('queue delivers by priority, then by age', () => {
  const clock = new ManualClock(0);
  const q = new PullQueue(clock, { visibilityTimeoutMs: 1000, maxAttempts: 3 });
  q.enqueue({ id: 'old-low', requires: [], priority: 1 });
  clock.advance(10);
  q.enqueue({ id: 'new-high', requires: [], priority: 5 });
  clock.advance(10);
  q.enqueue({ id: 'new-low', requires: [], priority: 1 });
  eq(q.pull('w', () => true).task.id, 'new-high', 'priority first');
  eq(q.pull('w', () => true).task.id, 'old-low', 'then oldest at equal priority');
});

check('pull respects the worker predicate — capacity is asserted, not assumed', () => {
  const clock = new ManualClock(0);
  const q = new PullQueue(clock, { visibilityTimeoutMs: 1000, maxAttempts: 3 });
  q.enqueue({ id: 'zk-task', requires: ['zk'] });
  eq(q.pull('w', (t) => t.requires.includes('hal')), null, 'refused work it cannot take');
  eq(q.pull('w', (t) => t.requires.includes('zk')).task.id, 'zk-task', 'took matching work');
});

check('an expired lease returns the task to the queue', () => {
  const clock = new ManualClock(0);
  const q = new PullQueue(clock, { visibilityTimeoutMs: 1000, maxAttempts: 3 });
  q.enqueue({ id: 't1', requires: [] });
  q.pull('w', () => true);
  eq(q.stats().leased, 1, 'leased');
  clock.advance(1001);
  eq(q.stats().pending, 1, 'reclaimed after the visibility timeout');
});

check('heartbeat extends a lease for work still in progress', () => {
  const clock = new ManualClock(0);
  const q = new PullQueue(clock, { visibilityTimeoutMs: 1000, maxAttempts: 3 });
  q.enqueue({ id: 't1', requires: [] });
  const lease = q.pull('w', () => true);
  clock.advance(900);
  eq(q.heartbeat(lease.leaseId), true, 'heartbeat accepted');
  clock.advance(900);
  eq(q.stats().leased, 1, 'still leased — heartbeat pushed the deadline out');
});

check('ack removes the task permanently', () => {
  const clock = new ManualClock(0);
  const q = new PullQueue(clock, { visibilityTimeoutMs: 1000, maxAttempts: 3 });
  q.enqueue({ id: 't1', requires: [] });
  const lease = q.pull('w', () => true);
  eq(q.ack(lease.leaseId), true, 'acked');
  eq(q.stats(), { pending: 0, leased: 0, deadLettered: 0 }, 'queue drained');
});

check('nack requeues until the attempt budget is spent, then dead-letters', () => {
  const clock = new ManualClock(0);
  const q = new PullQueue(clock, { visibilityTimeoutMs: 1000, maxAttempts: 3 });
  q.enqueue({ id: 't1', requires: [] });
  for (let i = 0; i < 3; i += 1) {
    const lease = q.pull('w', () => true);
    truthy(lease, `attempt ${i + 1} delivered`);
    q.nack(lease.leaseId, 'simulated failure');
  }
  eq(q.stats().pending, 0, 'no longer retried');
  eq(q.stats().deadLettered, 1, 'dead-lettered');
  eq(q.deadLetters()[0].attempts, 3, 'attempt count preserved for attribution');
});

check('a dead-lettered task is a named terminal state, not a thrown error', () => {
  const clock = new ManualClock(0);
  const q = new PullQueue(clock, { visibilityTimeoutMs: 1000, maxAttempts: 1 });
  q.enqueue({ id: 't1', requires: [] });
  const lease = q.pull('w', () => true);
  q.nack(lease.leaseId, 'bad tool call');
  const dl = q.deadLetters()[0];
  eq(dl.task.id, 't1', 'task preserved');
  eq(dl.reason, 'bad tool call', 'reason preserved');
  truthy(dl.deadLetteredAt !== undefined, 'timestamp preserved');
});

check('acking an already-expired lease reports failure rather than lying', () => {
  const clock = new ManualClock(0);
  const q = new PullQueue(clock, { visibilityTimeoutMs: 100, maxAttempts: 3 });
  q.enqueue({ id: 't1', requires: [] });
  const lease = q.pull('w', () => true);
  clock.advance(101);
  eq(q.ack(lease.leaseId), false, 'ack on an expired lease must not report success');
});

report();
