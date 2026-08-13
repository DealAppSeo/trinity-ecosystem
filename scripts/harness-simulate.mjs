#!/usr/bin/env node
// scripts/harness-simulate.mjs — E2E simulation of the trust harness.
//
// Run: node scripts/harness-simulate.mjs [--tasks N] [--seed N] [--json]
//
// Measures the harness against a naive baseline on the same seeded workload, so
// every number below is a difference produced by the mechanisms rather than by
// luck. Both arms see an identical task stream and identical expert behaviour;
// only the routing and fault-tolerance layers differ.
//
// The baseline arm is deliberately modelled on what the surveyed frameworks
// actually do: greedy selection on a score, no rate limiting, no capacity
// governance, no breaker, no quorum, and — the important one — trust taken
// from the expert's own claim rather than from earned history.
//
// Deterministic: same seed, same numbers. The clock is virtual, so a run
// covering hours of simulated traffic completes in under a second.

import { compileHarness } from './lib/harness-compile.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : fallback;
};
const TASKS = arg('tasks', 2000);
const SEED = arg('seed', 20260813);
const AS_JSON = argv.includes('--json');

const { load } = compileHarness();
const { ManualClock } = await load('types');
const { LeakyBucketLimiter } = await load('leaky-bucket');
const { CapacityGovernor } = await load('capacity');
const { TrustRouter, SeededRng } = await load('router');
const { CircuitBreakerRegistry } = await load('circuit-breaker');
const { QuorumEvaluator } = await load('quorum');
const { ReputationLedger } = await load('reputation');

// ── the simulated world ──────────────────────────────────────────────────────
//
// `trueQuality` is ground truth the harness cannot see. `claimedScore` is what
// an expert asserts about itself — the baseline trusts it; the harness ignores
// it. `degradesAt` silently multiplies latency and error rate partway through
// the run without the expert ever crashing.

/**
 * Ground-truth quality actually delivered across the whole run.
 *
 * The nominal `trueQuality` is not what an expert delivers if it degrades or
 * fails partway through. Ranking the harness against the nominal figure scored
 * it DOWN for correctly detecting `decayer`'s collapse — the metric was wrong,
 * not the harness. This computes the time-weighted effective quality instead.
 */
function effectiveQuality(e) {
  const degradeFrom = e.degradesAt ?? 1;
  const failFrom = e.failsAt ?? 1;
  const cut = Math.min(degradeFrom, failFrom);
  const healthyShare = cut;
  const rest = 1 - cut;
  // Degraded: quality * 0.4 and 10x errors. Failing: nothing succeeds at all.
  const restQuality = e.failsAt !== undefined && failFrom <= degradeFrom ? 0 : e.trueQuality * 0.4;
  const healthyDelivered = e.trueQuality * (1 - e.errorRate);
  return healthyShare * healthyDelivered + rest * restQuality;
}

const EXPERTS = [
  { id: 'alpha',   caps: ['hal'], trueQuality: 0.92, baseLatency: 120, errorRate: 0.02, claimedScore: 7000, capacity: 400 },
  { id: 'bravo',   caps: ['hal'], trueQuality: 0.88, baseLatency: 150, errorRate: 0.03, claimedScore: 6500, capacity: 400 },
  { id: 'charlie', caps: ['hal'], trueQuality: 0.85, baseLatency: 180, errorRate: 0.04, claimedScore: 6000, capacity: 400 },
  // Claims to be the best and is the worst. The baseline routes to it heavily.
  { id: 'boaster', caps: ['hal'], trueQuality: 0.35, baseLatency: 110, errorRate: 0.25, claimedScore: 10000, capacity: 400 },
  // Silently degrades at 40% through the run: 6x latency, 10x errors, no crash.
  { id: 'decayer', caps: ['hal'], trueQuality: 0.90, baseLatency: 130, errorRate: 0.02, claimedScore: 7000, capacity: 400, degradesAt: 0.4 },
  // Hard-fails from 60% onward. The breaker should isolate it.
  { id: 'crasher', caps: ['hal'], trueQuality: 0.80, baseLatency: 140, errorRate: 0.03, claimedScore: 6800, capacity: 400, failsAt: 0.6 },
  // Genuinely excellent, but unknown. Cold-start handling decides whether it
  // is ever discovered.
  { id: 'rookie',  caps: ['hal'], trueQuality: 0.95, baseLatency: 100, errorRate: 0.01, claimedScore: 0,    capacity: 400, cold: true },
];

const FALLBACK_QUALITY = 0.6; // generalist used when a breaker is open

function makeWorld(seed) {
  const rng = new SeededRng(seed);
  return {
    rng,
    /** Simulate one call. Returns latency, success, and ground-truth correctness. */
    call(expert, progress) {
      const degraded = expert.degradesAt !== undefined && progress >= expert.degradesAt;
      const failing = expert.failsAt !== undefined && progress >= expert.failsAt;

      const latency = failing
        ? expert.baseLatency * 0.5
        : expert.baseLatency * (degraded ? 6 : 1) * (0.8 + rng.next() * 0.4);

      const errorRate = failing ? 1.0 : expert.errorRate * (degraded ? 10 : 1);
      const ok = rng.next() > errorRate;
      const quality = degraded ? expert.trueQuality * 0.4 : expert.trueQuality;
      const correct = ok && rng.next() < quality;

      return { latencyMs: Math.round(latency), ok, correct };
    },
  };
}

const percentile = (values, p) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

/** Gini coefficient of the load distribution. 0 = perfectly even, 1 = all on one. */
function gini(counts) {
  const xs = [...counts].sort((a, b) => a - b);
  const n = xs.length;
  const total = xs.reduce((a, b) => a + b, 0);
  if (n === 0 || total === 0) return 0;
  let weighted = 0;
  for (let i = 0; i < n; i += 1) weighted += (i + 1) * xs[i];
  return (2 * weighted) / (n * total) - (n + 1) / n;
}

function emptyMetrics() {
  return {
    completed: 0,
    correct: 0,
    failed: 0,
    unroutable: 0,
    viaFallback: 0,
    latencies: [],
    perExpert: new Map(EXPERTS.map((e) => [e.id, 0])),
    callsToDegraded: 0,
    callsToCrasher: 0,
    rookieCalls: 0,
  };
}

// ── arm 1: naive baseline ────────────────────────────────────────────────────
//
// Greedy top-1 on self-claimed score. No limiter, no capacity, no breaker, no
// quorum, no cold-start exploration. One retry on error, to be fair to it.

function runBaseline(seed) {
  const world = makeWorld(seed);
  const m = emptyMetrics();

  for (let i = 0; i < TASKS; i += 1) {
    const progress = i / TASKS;
    // Rank purely by the expert's own claim — the defect being measured.
    const ranked = [...EXPERTS].sort((a, b) => b.claimedScore - a.claimedScore);

    let done = false;
    for (let attempt = 0; attempt < 2 && !done; attempt += 1) {
      const expert = ranked[attempt];
      if (!expert) break;
      const r = world.call(expert, progress);
      m.perExpert.set(expert.id, m.perExpert.get(expert.id) + 1);
      m.latencies.push(r.latencyMs);
      if (expert.degradesAt !== undefined && progress >= expert.degradesAt) m.callsToDegraded += 1;
      if (expert.failsAt !== undefined && progress >= expert.failsAt) m.callsToCrasher += 1;
      if (expert.id === 'rookie') m.rookieCalls += 1;

      if (r.ok) {
        m.completed += 1;
        if (r.correct) m.correct += 1;
        done = true;
      }
    }
    if (!done) m.failed += 1;
  }

  return m;
}

// ── arm 2: full harness ──────────────────────────────────────────────────────

function runHarness(seed) {
  const world = makeWorld(seed);
  const clock = new ManualClock(0);
  const m = emptyMetrics();

  const limiter = new LeakyBucketLimiter(clock, { tokensPerMinute: 600 });
  for (const e of EXPERTS) limiter.configure(e.id, { tokensPerMinute: e.capacity });

  const capacity = new CapacityGovernor(clock, {
    baseSlots: 6,
    minSlots: 1,
    maxSlots: 12,
    warmupSamples: 5,
    degradedRatio: 1.5,
    alpha: 0.3,
  });

  const breakers = new CircuitBreakerRegistry(clock, {
    thresholdFailures: 3,
    resetTimeoutMs: 30_000,
    successesToClose: 2,
  });

  const router = new TrustRouter(
    clock,
    limiter,
    capacity,
    { explorationRate: 0.12, congestionWeight: 0.9, trustFloor: 2000, alternatesCount: 3 },
    new SeededRng(seed ^ 0x5eed)
  );

  // Earned reputation, learned from observed outcomes. Confidence-weighted:
  // an expert's score is shrunk toward the neutral prior in proportion to how
  // little evidence stands behind it. Added after the first simulation run
  // scored Kendall tau 0.429 because a lucky 15-observation streak outranked a
  // 757-observation track record.
  const ledger = new ReputationLedger({ prior: 5000, alpha: 0.06, confidenceK: 50, coldStartConfidence: 0.5 });
  const updateEarned = (id, good) => ledger.record(id, good);

  const profiles = () =>
    EXPERTS.map((e) => ({
      id: e.id,
      capabilities: e.caps,
      // Rank on the UPPER CONFIDENCE BOUND, not the point estimate. Both are
      // ledger-derived; the UCB adds a bonus proportional to what we do not
      // yet know, which decays smoothly to zero as evidence accumulates. This
      // is what removes the cold-start cliff: with a binary flag, experts
      // pinned at exactly the graduation threshold and never advanced.
      earnedScore: ledger.upperConfidenceBound(e.id, 2500),
      perceivedScore: e.claimedScore, // carried, never ranked on
      coldStart: ledger.isColdStart(e.id),
    }));

  for (let i = 0; i < TASKS; i += 1) {
    const progress = i / TASKS;
    clock.advance(100); // virtual arrival interval

    const task = { id: `t${i}`, requires: ['hal'], estimatedTokens: 1 };
    const tried = [];
    let done = false;

    // Up to three attempts, walking the router's ranked alternates.
    for (let attempt = 0; attempt < 3 && !done; attempt += 1) {
      const decision = router.route(task, profiles(), {
        exclude: tried,
        isCircuitOpen: (id) => breakers.isOpen(id),
      });

      if (!decision.selected) {
        // Every expert is unavailable. A generalist fallback keeps the request
        // alive, and is recorded as a fallback rather than as an expert win.
        const correct = world.rng.next() < FALLBACK_QUALITY;
        m.completed += 1;
        m.viaFallback += 1;
        if (correct) m.correct += 1;
        m.latencies.push(200);
        done = true;
        break;
      }

      const id = decision.selected;
      const expert = EXPERTS.find((e) => e.id === id);
      tried.push(id);

      limiter.tryConsume(id, 1);
      capacity.acquire(id);
      const r = world.call(expert, progress);
      capacity.release(id);

      capacity.observe(id, r.latencyMs, r.ok);
      m.perExpert.set(id, m.perExpert.get(id) + 1);
      m.latencies.push(r.latencyMs);
      if (expert.degradesAt !== undefined && progress >= expert.degradesAt) m.callsToDegraded += 1;
      if (expert.failsAt !== undefined && progress >= expert.failsAt) m.callsToCrasher += 1;
      if (id === 'rookie') m.rookieCalls += 1;

      if (r.ok) {
        breakers.recordSuccess(id);
        updateEarned(id, r.correct);
        m.completed += 1;
        if (r.correct) m.correct += 1;
        done = true;
      } else {
        breakers.recordFailure(id);
        updateEarned(id, false);
      }

      // A degraded expert loses slots via the governor; also fold the signal
      // into earned reputation so routing reacts before the breaker trips.
      if (capacity.health(id) === 'degraded') updateEarned(id, false);
    }

    if (!done) m.failed += 1;
  }

  return { m, ledger, breakers, capacity };
}

// ── run and report ───────────────────────────────────────────────────────────

const baseline = runBaseline(SEED);
const { m: harness, ledger, breakers, capacity } = runHarness(SEED);

const summarise = (m) => {
  const counts = [...m.perExpert.values()];
  const total = counts.reduce((a, b) => a + b, 0);
  return {
    tasks: TASKS,
    completed: m.completed,
    completionRate: m.completed / TASKS,
    correct: m.correct,
    correctnessRate: m.correct / TASKS,
    failed: m.failed,
    viaFallback: m.viaFallback,
    totalCalls: total,
    callsPerTask: total / TASKS,
    p50LatencyMs: percentile(m.latencies, 50),
    p95LatencyMs: percentile(m.latencies, 95),
    p99LatencyMs: percentile(m.latencies, 99),
    loadGini: gini(counts),
    maxExpertShare: total === 0 ? 0 : Math.max(...counts) / total,
    callsToDegradedExpert: m.callsToDegraded,
    callsToCrashedExpert: m.callsToCrasher,
    rookieCalls: m.rookieCalls,
    perExpert: Object.fromEntries(m.perExpert),
  };
};

const b = summarise(baseline);
const h = summarise(harness);

if (AS_JSON) {
  console.log(JSON.stringify({ seed: SEED, tasks: TASKS, baseline: b, harness: h }, null, 2));
  process.exit(0);
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const delta = (bv, hv, invert = false) => {
  if (bv === 0) return hv === 0 ? '0' : 'n/a';
  const change = ((hv - bv) / Math.abs(bv)) * 100;
  const better = invert ? change < 0 : change > 0;
  return `${change >= 0 ? '+' : ''}${change.toFixed(1)}% ${better ? '✓' : '✗'}`;
};

const row = (label, bv, hv, fmt = (x) => String(x), invert = false) =>
  `${label.padEnd(30)} ${fmt(bv).padStart(12)} ${fmt(hv).padStart(12)}   ${delta(bv, hv, invert)}`;

console.log(`\nTrustShell harness — E2E simulation`);
console.log(`seed=${SEED}  tasks=${TASKS}  experts=${EXPERTS.length}\n`);
console.log(`${''.padEnd(30)} ${'baseline'.padStart(12)} ${'harness'.padStart(12)}   delta`);
console.log('-'.repeat(76));
console.log(row('correct answers', b.correct, h.correct));
console.log(row('correctness rate', b.correctnessRate, h.correctnessRate, pct));
console.log(row('completion rate', b.completionRate, h.completionRate, pct));
console.log(row('unrecovered failures', b.failed, h.failed, (x) => String(x), true));
console.log(row('calls per task', b.callsPerTask, h.callsPerTask, (x) => x.toFixed(2), true));
console.log(row('p50 latency (ms)', b.p50LatencyMs, h.p50LatencyMs, (x) => String(x), true));
console.log(row('p95 latency (ms)', b.p95LatencyMs, h.p95LatencyMs, (x) => String(x), true));
console.log(row('p99 latency (ms)', b.p99LatencyMs, h.p99LatencyMs, (x) => String(x), true));
console.log(row('load Gini (0=even)', b.loadGini, h.loadGini, (x) => x.toFixed(3), true));
console.log(row('max single-expert share', b.maxExpertShare, h.maxExpertShare, pct, true));
console.log(row('calls to degraded expert', b.callsToDegradedExpert, h.callsToDegradedExpert, (x) => String(x), true));
console.log(row('calls to crashed expert', b.callsToCrashedExpert, h.callsToCrashedExpert, (x) => String(x), true));
console.log(row('calls to cold-start rookie', b.rookieCalls, h.rookieCalls));

console.log(`\nLoad distribution (calls per expert)`);
console.log('-'.repeat(76));
for (const e of EXPERTS) {
  const bar = (n, total) => '█'.repeat(Math.round((n / Math.max(1, total)) * 40));
  console.log(
    `  ${e.id.padEnd(9)} q=${e.trueQuality.toFixed(2)} claim=${String(e.claimedScore).padStart(5)}  ` +
      `baseline ${String(b.perExpert[e.id]).padStart(5)}  harness ${String(h.perExpert[e.id]).padStart(5)}  ${bar(h.perExpert[e.id], h.totalCalls)}`
  );
}

console.log(`\nWhat the harness LEARNED (earned reputation, 0-10000)`);
console.log('-'.repeat(76));
const ranked = EXPERTS.map((e) => ({
  id: e.id,
  trueQuality: e.trueQuality,
  earned: ledger.earnedScore(e.id),
  observed: ledger.view(e.id).observedScore,
  confidence: ledger.view(e.id).confidence,
  observations: ledger.observations(e.id),
  breaker: breakers.view(e.id).state,
  health: capacity.health(e.id),
})).sort((a, b2) => b2.earned - a.earned);

for (const r of ranked) {
  console.log(
    `  ${r.id.padEnd(9)} earned=${String(r.earned).padStart(5)}  observed=${String(r.observed).padStart(5)}  ` +
      `conf=${r.confidence.toFixed(2)}  true=${r.trueQuality.toFixed(2)}  eff=${effectiveQuality(EXPERTS.find((e) => e.id === r.id)).toFixed(2)}  obs=${String(r.observations).padStart(4)}  ` +
      `breaker=${r.breaker.padEnd(9)} health=${r.health}`
  );
}

// Rank correlation between what the harness learned and ground truth. This is
// the single number that says whether the reputation layer works at all.
const byEarned = [...ranked].sort((a, b2) => b2.earned - a.earned).map((r) => r.id);
const effByld = new Map(EXPERTS.map((e) => [e.id, effectiveQuality(e)]));
const byTruth = [...ranked]
  .sort((a, b2) => effByld.get(b2.id) - effByld.get(a.id))
  .map((r) => r.id);
let concordant = 0;
let comparisons = 0;
for (let i = 0; i < byTruth.length; i += 1) {
  for (let j = i + 1; j < byTruth.length; j += 1) {
    comparisons += 1;
    if (byEarned.indexOf(byTruth[i]) < byEarned.indexOf(byTruth[j])) concordant += 1;
  }
}
const tau = comparisons === 0 ? 0 : (2 * concordant) / comparisons - 1;

console.log(`\n  Kendall tau (learned rank vs EFFECTIVE quality): ${tau.toFixed(3)}   [1.0 = perfect, 0 = random]`);
console.log(`  (effective quality accounts for degradation/failure partway through the run;`);
console.log(`   ranking against nominal quality penalises the harness for correctly detecting decay)`);
console.log(`  Boaster: claimed 10000, earned ${ledger.earnedScore('boaster')}, true quality 0.35`);
console.log(`  Rookie:  claimed 0, earned ${ledger.earnedScore('rookie')}, true quality 0.95\n`);
