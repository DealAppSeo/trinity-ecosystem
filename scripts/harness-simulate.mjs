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
// Ablation: run the harness arm with the timeout policy disabled, so a hang is
// bounded only by the outer run deadline exactly as it is for the baseline.
// This is the honest A/B for the timeout module specifically — comparing the
// full harness against the naive baseline conflates it with every other
// mechanism and would credit the timeout for wins it did not produce.
const NO_TIMEOUT = argv.includes('--no-timeout');

const { load } = compileHarness();
const { ManualClock } = await load('types');
const { LeakyBucketLimiter } = await load('leaky-bucket');
const { CapacityGovernor } = await load('capacity');
const { TrustRouter, SeededRng } = await load('router');
const { CircuitBreakerRegistry } = await load('circuit-breaker');
const { QuorumEvaluator } = await load('quorum');
const { ReputationLedger } = await load('reputation');
const { TimeoutPolicy } = await load('timeout');
const { ContextTransformer, approximateTokens } = await load('transform');

// The run/idle split. IDLE is short because it measures time since the last
// observed progress; RUN has to be long enough for the slowest legitimate task,
// which is exactly why it is useless as a hang detector on its own.
const RUN_TIMEOUT_MS = 10_000;
const IDLE_TIMEOUT_MS = 1_500;

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
  const hangFrom = e.hangsAt ?? 1;
  const cut = Math.min(degradeFrom, failFrom, hangFrom);
  const healthyShare = cut;
  const rest = 1 - cut;
  const healthyDelivered = e.trueQuality * (1 - e.errorRate);

  // Degraded: quality * 0.4 and 10x errors. Failing: nothing succeeds at all.
  // Hanging: the `hangRate` share of calls returns nothing at all, so the
  // expert delivers only on the remainder.
  //
  // The hang term is NOT optional bookkeeping. Adding a hanging expert without
  // it would rank the harness against a quality the expert never delivered,
  // scoring it DOWN for correctly demoting a staller — the identical wrong-
  // metric defect that produced the spurious tau 0.333 earlier today.
  let restQuality;
  if (e.failsAt !== undefined && failFrom <= degradeFrom && failFrom <= hangFrom) {
    restQuality = 0;
  } else if (e.hangsAt !== undefined && hangFrom <= degradeFrom && hangFrom <= failFrom) {
    restQuality = healthyDelivered * (1 - e.hangRate);
  } else {
    restQuality = e.trueQuality * 0.4;
  }

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
  // HANGS from 50% onward, half its calls, and never errors while doing it.
  // Invisible to the breaker (no failure), to the capacity governor (no
  // completion, so no latency sample) and to the ledger (no outcome). It claims
  // 9000 so the baseline — which believes claims — actually routes to it.
  { id: 'stalled', caps: ['hal'], trueQuality: 0.85, baseLatency: 160, errorRate: 0.03, claimedScore: 9000, capacity: 400, hangsAt: 0.5, hangRate: 0.5 },
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

      // A hang is not an error and not a slow success — it is the absence of
      // any signal at all. The call simply never comes back, so `ok`,
      // `correct` and `latencyMs` are all meaningless and the caller must
      // discover it by deadline or not at all.
      if (expert.hangsAt !== undefined && progress >= expert.hangsAt && rng.next() < expert.hangRate) {
        return { latencyMs: 0, ok: false, correct: false, hang: true };
      }

      const latency = failing
        ? expert.baseLatency * 0.5
        : expert.baseLatency * (degraded ? 6 : 1) * (0.8 + rng.next() * 0.4);

      const errorRate = failing ? 1.0 : expert.errorRate * (degraded ? 10 : 1);
      const ok = rng.next() > errorRate;
      const quality = degraded ? expert.trueQuality * 0.4 : expert.trueQuality;
      const correct = ok && rng.next() < quality;

      return { latencyMs: Math.round(latency), ok, correct, hang: false };
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
    hangsHit: 0,
    hangStallMs: 0,
    hangsByIdle: 0,
    hangsByRun: 0,
    abortsLanded: 0,
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
      if (expert.degradesAt !== undefined && progress >= expert.degradesAt) m.callsToDegraded += 1;
      if (expert.failsAt !== undefined && progress >= expert.failsAt) m.callsToCrasher += 1;
      if (expert.id === 'rookie') m.rookieCalls += 1;

      if (r.hang) {
        // The baseline has no idle deadline, so a hang is only ever bounded by
        // the outer run deadline. It is GENEROUS to credit it with even that —
        // a caller with no timeout mechanism at all never returns. The stall is
        // charged as latency and the attempt is consumed.
        m.hangsHit += 1;
        m.hangStallMs += RUN_TIMEOUT_MS;
        m.latencies.push(RUN_TIMEOUT_MS);
        continue;
      }
      m.latencies.push(r.latencyMs);

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

  const timeouts = new TimeoutPolicy(clock, {
    runTimeoutMs: RUN_TIMEOUT_MS,
    idleTimeoutMs: IDLE_TIMEOUT_MS,
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
  const ledger = new ReputationLedger({ prior: 5000, alpha: 0.06, confidenceK: 20, coldStartConfidence: 0.5 });
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

  // Abandoned calls we have stopped waiting for but cannot prove are dead.
  // The transport is modelled as taking a grace period to land an abort; until
  // it does, the slot stays stranded and the expert is not handed more work.
  const pendingAborts = [];
  const ABORT_GRACE_MS = IDLE_TIMEOUT_MS * 2;

  for (let i = 0; i < TASKS; i += 1) {
    const progress = i / TASKS;
    clock.advance(100); // virtual arrival interval

    // Land any aborts whose grace period has elapsed. Reclaiming on a schedule
    // the CALLER owns, rather than inside the governor, is deliberate: the
    // governor must never invent a grace period it cannot observe.
    while (pendingAborts.length > 0 && pendingAborts[0].at <= clock.now()) {
      const done = pendingAborts.shift();
      capacity.reclaim(done.expert);
      timeouts.settle(done.attemptId, 'confirmed_dead');
      m.abortsLanded += 1;
    }

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
      const attempt = timeouts.begin(id, task.id);
      const r = world.call(expert, progress);

      m.perExpert.set(id, m.perExpert.get(id) + 1);
      if (expert.degradesAt !== undefined && progress >= expert.degradesAt) m.callsToDegraded += 1;
      if (expert.failsAt !== undefined && progress >= expert.failsAt) m.callsToCrasher += 1;
      if (id === 'rookie') m.rookieCalls += 1;

      if (r.hang && NO_TIMEOUT) {
        // No idle deadline: the hang is bounded only by the run deadline, and
        // because nothing ever completes there is no failure to record. The
        // breaker, the capacity governor and the ledger all learn nothing.
        m.hangsHit += 1;
        m.hangStallMs += RUN_TIMEOUT_MS;
        m.latencies.push(RUN_TIMEOUT_MS);
        clock.advance(RUN_TIMEOUT_MS);
        capacity.release(id);
        continue;
      }

      if (r.hang) {
        // No heartbeat ever arrives, so the idle deadline is what fires. Time
        // genuinely passes while the caller waits for it — the detection is
        // not free, and charging it here is what keeps the latency figures
        // honest rather than flattering.
        m.hangsHit += 1;
        clock.advance(IDLE_TIMEOUT_MS);
        const expired = timeouts.sweep();

        for (const e of expired) {
          // NOT release. We stopped waiting; the expert did not stop working.
          // Releasing here is the phantom slot — see capacity.ts.
          capacity.strand(e.attempt.expert);
          if (e.kind === 'idle') m.hangsByIdle += 1;
          else m.hangsByRun += 1;
          m.hangStallMs += e.elapsedMs;
          m.latencies.push(e.elapsedMs);
          // The signal the other layers could not otherwise obtain.
          capacity.observe(e.attempt.expert, e.elapsedMs, false);
          breakers.recordFailure(e.attempt.expert);
          updateEarned(e.attempt.expert, false);
          pendingAborts.push({
            expert: e.attempt.expert,
            attemptId: e.attempt.id,
            at: clock.now() + ABORT_GRACE_MS,
          });
        }
        continue;
      }

      // A completed call closes its attempt, so it can never be swept as a
      // hang. The clock is deliberately NOT advanced by the call duration:
      // the pre-existing 100ms arrival interval is left exactly as it was so
      // this run differs from the last one in the hang path alone, and the
      // delta is attributable to the mechanism rather than to a retimed world.
      timeouts.complete(attempt.id);
      capacity.release(id);

      capacity.observe(id, r.latencyMs, r.ok);
      m.latencies.push(r.latencyMs);

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

  return { m, ledger, breakers, capacity, timeouts };
}

// ── run and report ───────────────────────────────────────────────────────────

const baseline = runBaseline(SEED);
const { m: harness, ledger, breakers, capacity, timeouts } = runHarness(SEED);

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
    hangsHit: m.hangsHit,
    hangStallMs: m.hangStallMs,
    hangsByIdle: m.hangsByIdle,
    hangsByRun: m.hangsByRun,
    meanHangDetectMs: m.hangsHit === 0 ? 0 : m.hangStallMs / m.hangsHit,
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
console.log(row('hangs encountered', b.hangsHit, h.hangsHit, (x) => String(x), true));
console.log(row('mean hang detection (ms)', b.meanHangDetectMs, h.meanHangDetectMs, (x) => x.toFixed(0), true));
console.log(row('wall clock lost to hangs (s)', b.hangStallMs / 1000, h.hangStallMs / 1000, (x) => x.toFixed(1), true));

console.log(`\nLoad distribution (calls per expert)`);
console.log('-'.repeat(76));
for (const e of EXPERTS) {
  const bar = (n, total) => '█'.repeat(Math.round((n / Math.max(1, total)) * 40));
  console.log(
    `  ${e.id.padEnd(9)} q=${e.trueQuality.toFixed(2)} claim=${String(e.claimedScore).padStart(5)}  ` +
      `baseline ${String(b.perExpert[e.id]).padStart(5)}  harness ${String(h.perExpert[e.id]).padStart(5)}  ${bar(h.perExpert[e.id], h.totalCalls)}`
  );
}

console.log(`\nHang detection (the run/idle split)`);
console.log('-'.repeat(76));
console.log(`  baseline: no idle deadline. ${b.hangsHit} hang(s), each bounded only by the`);
console.log(`            ${RUN_TIMEOUT_MS}ms run deadline it is GENEROUSLY credited with but does not implement.`);
console.log(`  harness:  ${h.hangsHit} hang(s) — ${h.hangsByIdle} caught by the idle deadline, ${h.hangsByRun} by the run deadline.`);
console.log(`            mean detection ${h.meanHangDetectMs.toFixed(0)}ms vs ${b.meanHangDetectMs.toFixed(0)}ms, a ${(b.meanHangDetectMs / Math.max(1, h.meanHangDetectMs)).toFixed(1)}x faster stall.`);
console.log(`  attempts still in flight at end of run: ${timeouts.inFlight()} (a leak would show here)`);
console.log(
  `  abandoned attempts: ${harness.abortsLanded} settled as confirmed_dead, ` +
    `${timeouts.unsettledCount()} still unaccounted for (a leak would show here too)`
);
console.log(
  `  stranded slots at end of run: ${EXPERTS.reduce((n, e) => n + capacity.stranded(e.id), 0)}` +
    ` — a slot we stopped waiting on but never confirmed free. Never released on a`
);
console.log(
  `  timeout: giving up on a call does not stop the expert running it, and handing`
);
console.log(`  that slot back is how a hung expert keeps being sent work.`);

// ── context-bloat measurement ────────────────────────────────────────────────
//
// The routing arms above have no message dimension, so they cannot say anything
// about `transform.ts`. This is a SEPARATE measurement on its own model: a
// conversation that grows for TURNS turns, with a pinned system prompt and
// tool-call pairs, measured with and without the transform. It does not touch
// the routing simulation — those numbers are unchanged by construction.

function runContextBloat(seed) {
  const rng = new SeededRng(seed ^ 0xc0ffee);
  const TURNS = 400;
  const BUDGET = 4000;

  const messages = [
    { id: 'sys', role: 'system', content: 'S'.repeat(600 * 4), pinned: true },
  ];
  const transformer = new ContextTransformer(
    new ManualClock(0),
    { maxTokens: BUDGET, headKeep: 2, tailKeep: 6 },
    approximateTokens
  );

  let peakUntransformed = 0;
  let peakTransformed = 0;
  let sumUntransformed = 0;
  let sumTransformed = 0;
  let ratioSum = 0;
  let overBudget = 0;
  let pairsSplit = 0;
  let pinnedLost = 0;
  let lastDropped = 0;
  let lastKept = 0;
  let totalMessages = 0;

  for (let t = 0; t < TURNS; t += 1) {
    const size = 40 + Math.floor(rng.next() * 160);
    messages.push({ id: `u${t}`, role: 'user', content: 'u'.repeat(size * 4) });
    // Every third turn is a tool call plus its result, sharing a pairId.
    if (t % 3 === 0) {
      messages.push({ id: `c${t}`, role: 'assistant', content: 'c'.repeat(30 * 4), pairId: `p${t}` });
      messages.push({ id: `r${t}`, role: 'tool', content: 'r'.repeat(90 * 4), pairId: `p${t}` });
    } else {
      messages.push({ id: `a${t}`, role: 'assistant', content: 'a'.repeat(size * 4) });
    }

    const res = transformer.transform(messages);
    sumUntransformed += res.originalTokens;
    sumTransformed += res.retainedTokens;
    ratioSum += res.compressionRatio;
    peakUntransformed = Math.max(peakUntransformed, res.originalTokens);
    peakTransformed = Math.max(peakTransformed, res.retainedTokens);
    lastDropped = res.droppedIds.length;
    lastKept = res.messages.length;
    totalMessages = messages.length;
    if (!res.withinBudget) overBudget += 1;

    // Integrity invariants, checked on every single turn rather than asserted.
    const kept = new Set(res.messages.map((m) => m.id));
    if (!kept.has('sys')) pinnedLost += 1;
    const byPair = new Map();
    for (const m of messages) {
      if (m.pairId === undefined) continue;
      if (!byPair.has(m.pairId)) byPair.set(m.pairId, []);
      byPair.get(m.pairId).push(kept.has(m.id));
    }
    for (const flags of byPair.values()) {
      if (flags.some(Boolean) && !flags.every(Boolean)) pairsSplit += 1;
    }
  }

  return {
    turns: TURNS, budget: BUDGET,
    peakUntransformed, peakTransformed,
    meanUntransformed: sumUntransformed / TURNS,
    meanTransformed: sumTransformed / TURNS,
    meanRatio: ratioSum / TURNS,
    lastDropped, lastKept, totalMessages, overBudget, pairsSplit, pinnedLost,
  };
}

const ctx = runContextBloat(SEED);
console.log(`\nContext-bloat control (separate model — does NOT touch the routing arms above)`);
console.log('-'.repeat(76));
console.log(`  ${ctx.turns} turns, ${ctx.budget}-token budget, pinned system prompt, tool pairs every 3rd turn`);
console.log(row('peak context (tokens)', ctx.peakUntransformed, ctx.peakTransformed, (x) => String(Math.round(x)), true));
console.log(row('mean context (tokens)', ctx.meanUntransformed, ctx.meanTransformed, (x) => String(Math.round(x)), true));
console.log(`  mean compression ratio (retained/original): ${ctx.meanRatio.toFixed(3)}`);
// Deliberately NOT a cumulative drop count. Each turn re-transforms the whole
// conversation, so summing per-turn drops counts the same message hundreds of
// times: it read 173800 for a run containing 1200 messages. A number that large
// looks impressive and means nothing — the same wrong-metric shape this file
// already carries two warnings about.
console.log(`  final turn: ${ctx.lastKept} of ${ctx.totalMessages} messages retained (${ctx.lastDropped} dropped)`);
console.log(`  INTEGRITY — pairs split: ${ctx.pairsSplit}  pinned lost: ${ctx.pinnedLost}  turns over budget: ${ctx.overBudget}`);
console.log(`  (pairs split and pinned lost must both be 0; a non-zero value is a defect, not a tradeoff)`);

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
