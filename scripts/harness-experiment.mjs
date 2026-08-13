#!/usr/bin/env node
// scripts/harness-experiment.mjs — parameter A/B sweep for the trust harness.
//
// Run: node scripts/harness-experiment.mjs [--tasks N]
//
// WHAT THIS CAN AND CANNOT TELL YOU. Every number here comes from the modelled
// world in harness-simulate.mjs. Tuning parameters against a simulator is
// tuning against a model someone wrote, and a configuration that wins here has
// demonstrated exactly one thing: it wins here. That is worth something —
// robustness across seeds, and ranking defects that are real regardless of
// magnitude — and it is not evidence about live traffic.
//
// The design guards the one failure that would make even the in-model result
// worthless: OVERFITTING THE SEEDS. Configurations are ranked on TRAIN seeds
// and then re-measured on HOLDOUT seeds that took no part in the choice. A
// config that wins on train and not on holdout was fitted to noise, and this
// script says so rather than reporting the train number.
//
// The arm below is a faithful copy of runHarness() in harness-simulate.mjs.
// Duplication is a divergence risk, so the first thing the script does is
// assert it reproduces the simulator's published default. If that check fails
// the sweep is invalid and nothing else is printed.

import { compileHarness } from './lib/harness-compile.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : fallback;
};
const TASKS = arg('tasks', 2000);

const { load } = compileHarness();
const { ManualClock } = await load('types');
const { LeakyBucketLimiter } = await load('leaky-bucket');
const { CapacityGovernor } = await load('capacity');
const { TrustRouter, SeededRng } = await load('router');
const { CircuitBreakerRegistry } = await load('circuit-breaker');
const { ReputationLedger } = await load('reputation');
const { TimeoutPolicy } = await load('timeout');

const RUN_TIMEOUT_MS = 10_000;
const IDLE_TIMEOUT_MS = 1_500;

const EXPERTS_BASE = [
  { id: 'alpha',   caps: ['hal'], trueQuality: 0.92, baseLatency: 120, errorRate: 0.02, claimedScore: 7000, capacity: 400 },
  { id: 'bravo',   caps: ['hal'], trueQuality: 0.88, baseLatency: 150, errorRate: 0.03, claimedScore: 6500, capacity: 400 },
  { id: 'charlie', caps: ['hal'], trueQuality: 0.85, baseLatency: 180, errorRate: 0.04, claimedScore: 6000, capacity: 400 },
  { id: 'boaster', caps: ['hal'], trueQuality: 0.35, baseLatency: 110, errorRate: 0.25, claimedScore: 10000, capacity: 400 },
  { id: 'decayer', caps: ['hal'], trueQuality: 0.90, baseLatency: 130, errorRate: 0.02, claimedScore: 7000, capacity: 400, degradesAt: 0.4 },
  { id: 'crasher', caps: ['hal'], trueQuality: 0.80, baseLatency: 140, errorRate: 0.03, claimedScore: 6800, capacity: 400, failsAt: 0.6 },
  { id: 'rookie',  caps: ['hal'], trueQuality: 0.95, baseLatency: 100, errorRate: 0.01, claimedScore: 0,    capacity: 400, cold: true },
  { id: 'stalled', caps: ['hal'], trueQuality: 0.85, baseLatency: 160, errorRate: 0.03, claimedScore: 9000, capacity: 400, hangsAt: 0.5, hangRate: 0.5 },
];

const FALLBACK_QUALITY = 0.6;

// The pool is swappable. The default world contains `rookie` — a deliberately
// EXCELLENT unknown expert (true quality 0.95, claims 0). Any arm that wins by
// exploring more is, in that world, being rewarded for finding a gem that was
// planted for it to find. The NOGEM pool replaces it with a mediocre unknown,
// which is the honest test of whether "explore more" is a real improvement or
// an artefact of the scenario.
let EXPERTS = EXPERTS_BASE;
const withPool = (pool, fn) => {
  const prev = EXPERTS;
  EXPERTS = pool;
  try { return fn(); } finally { EXPERTS = prev; }
};
const EXPERTS_NOGEM = EXPERTS_BASE.map((e) =>
  e.id === 'rookie' ? { ...e, trueQuality: 0.5 } : e
);

function effectiveQuality(e) {
  const degradeFrom = e.degradesAt ?? 1;
  const failFrom = e.failsAt ?? 1;
  const hangFrom = e.hangsAt ?? 1;
  const cut = Math.min(degradeFrom, failFrom, hangFrom);
  const healthyDelivered = e.trueQuality * (1 - e.errorRate);
  let restQuality;
  if (e.failsAt !== undefined && failFrom <= degradeFrom && failFrom <= hangFrom) restQuality = 0;
  else if (e.hangsAt !== undefined && hangFrom <= degradeFrom && hangFrom <= failFrom)
    restQuality = healthyDelivered * (1 - e.hangRate);
  else restQuality = e.trueQuality * 0.4;
  return cut * healthyDelivered + (1 - cut) * restQuality;
}

function makeWorld(seed) {
  const rng = new SeededRng(seed);
  return {
    rng,
    call(expert, progress) {
      const degraded = expert.degradesAt !== undefined && progress >= expert.degradesAt;
      const failing = expert.failsAt !== undefined && progress >= expert.failsAt;
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

function gini(counts) {
  const xs = [...counts].sort((a, b) => a - b);
  const n = xs.length;
  const total = xs.reduce((a, b) => a + b, 0);
  if (n === 0 || total === 0) return 0;
  let weighted = 0;
  for (let i = 0; i < n; i += 1) weighted += (i + 1) * xs[i];
  return (2 * weighted) / (n * total) - (n + 1) / n;
}

const DEFAULTS = {
  explorationRate: 0.12,
  congestionWeight: 0.9,
  trustFloor: 2000,
  alternatesCount: 3,
  ucbOptimism: 2500,
  prior: 5000,
  ledgerAlpha: 0.06,
  confidenceK: 50,
  coldStartConfidence: 0.5,
};

/** Faithful copy of runHarness() from harness-simulate.mjs, parameterised. */
function runHarness(seed, over = {}) {
  const P = { ...DEFAULTS, ...over };
  const world = makeWorld(seed);
  const clock = new ManualClock(0);

  const perExpert = new Map(EXPERTS.map((e) => [e.id, 0]));
  const latencies = [];
  let completed = 0;
  let correct = 0;
  let failed = 0;
  let hangsHit = 0;

  const limiter = new LeakyBucketLimiter(clock, { tokensPerMinute: 600 });
  for (const e of EXPERTS) limiter.configure(e.id, { tokensPerMinute: e.capacity });

  const capacity = new CapacityGovernor(clock, {
    baseSlots: 6, minSlots: 1, maxSlots: 12,
    warmupSamples: 5, degradedRatio: 1.5, alpha: 0.3,
  });
  const breakers = new CircuitBreakerRegistry(clock, {
    thresholdFailures: 3, resetTimeoutMs: 30_000, successesToClose: 2,
  });
  const timeouts = new TimeoutPolicy(clock, {
    runTimeoutMs: RUN_TIMEOUT_MS, idleTimeoutMs: IDLE_TIMEOUT_MS,
  });
  const router = new TrustRouter(
    clock, limiter, capacity,
    {
      explorationRate: P.explorationRate,
      congestionWeight: P.congestionWeight,
      trustFloor: P.trustFloor,
      alternatesCount: P.alternatesCount,
    },
    new SeededRng(seed ^ 0x5eed)
  );
  const ledger = new ReputationLedger({
    prior: P.prior, alpha: P.ledgerAlpha,
    confidenceK: P.confidenceK, coldStartConfidence: P.coldStartConfidence,
  });
  const updateEarned = (id, good) => ledger.record(id, good);

  const profiles = () =>
    EXPERTS.map((e) => ({
      id: e.id,
      capabilities: e.caps,
      earnedScore: ledger.upperConfidenceBound(e.id, P.ucbOptimism),
      perceivedScore: e.claimedScore,
      coldStart: ledger.isColdStart(e.id),
    }));

  for (let i = 0; i < TASKS; i += 1) {
    const progress = i / TASKS;
    clock.advance(100);
    const task = { id: `t${i}`, requires: ['hal'], estimatedTokens: 1 };
    const tried = [];
    let done = false;

    for (let attempt = 0; attempt < 3 && !done; attempt += 1) {
      const decision = router.route(task, profiles(), {
        exclude: tried,
        isCircuitOpen: (id) => breakers.isOpen(id),
      });

      if (!decision.selected) {
        const ok = world.rng.next() < FALLBACK_QUALITY;
        completed += 1;
        if (ok) correct += 1;
        latencies.push(200);
        done = true;
        break;
      }

      const id = decision.selected;
      const expert = EXPERTS.find((e) => e.id === id);
      tried.push(id);

      limiter.tryConsume(id, 1);
      capacity.acquire(id);
      const attemptH = timeouts.begin(id, task.id);
      const r = world.call(expert, progress);

      perExpert.set(id, perExpert.get(id) + 1);

      if (r.hang) {
        hangsHit += 1;
        clock.advance(IDLE_TIMEOUT_MS);
        const expired = timeouts.sweep();
        capacity.release(id);
        for (const e of expired) {
          latencies.push(e.elapsedMs);
          capacity.observe(e.attempt.expert, e.elapsedMs, false);
          breakers.recordFailure(e.attempt.expert);
          updateEarned(e.attempt.expert, false);
        }
        continue;
      }

      timeouts.complete(attemptH.id);
      capacity.release(id);
      capacity.observe(id, r.latencyMs, r.ok);
      latencies.push(r.latencyMs);

      if (r.ok) {
        breakers.recordSuccess(id);
        updateEarned(id, r.correct);
        completed += 1;
        if (r.correct) correct += 1;
        done = true;
      } else {
        breakers.recordFailure(id);
        updateEarned(id, false);
      }
      if (capacity.health(id) === 'degraded') updateEarned(id, false);
    }
    if (!done) failed += 1;
  }

  // Kendall tau of learned rank against effective quality.
  const byEarned = [...EXPERTS]
    .map((e) => ({ id: e.id, earned: ledger.earnedScore(e.id) }))
    .sort((a, b) => b.earned - a.earned)
    .map((r) => r.id);
  const effBy = new Map(EXPERTS.map((e) => [e.id, effectiveQuality(e)]));
  const byTruth = [...EXPERTS].sort((a, b) => effBy.get(b.id) - effBy.get(a.id)).map((e) => e.id);
  let concordant = 0;
  let comparisons = 0;
  for (let i = 0; i < byTruth.length; i += 1) {
    for (let j = i + 1; j < byTruth.length; j += 1) {
      comparisons += 1;
      if (byEarned.indexOf(byTruth[i]) < byEarned.indexOf(byTruth[j])) concordant += 1;
    }
  }
  const tau = comparisons === 0 ? 0 : (2 * concordant) / comparisons - 1;
  const counts = [...perExpert.values()];

  return {
    correctnessRate: correct / TASKS,
    failed,
    p99: percentile(latencies, 99),
    p50: percentile(latencies, 50),
    gini: gini(counts),
    tau,
    hangsHit,
    rookieCalls: perExpert.get('rookie'),
    perExpert: Object.fromEntries(perExpert),
  };
}

// ── validity guard ───────────────────────────────────────────────────────────
//
// This arm is a copy. If it has drifted from harness-simulate.mjs the sweep is
// measuring something else, so refuse to report rather than report a number
// that cannot be reproduced by the published simulator.

const PUBLISHED = { seed: 20260813, correctnessRate: 0.89, p99: 794, tau: 0.643 };
const guard = runHarness(PUBLISHED.seed);
const guardOk =
  Math.abs(guard.correctnessRate - PUBLISHED.correctnessRate) < 0.0005 &&
  guard.p99 === PUBLISHED.p99 &&
  Math.abs(guard.tau - PUBLISHED.tau) < 0.0005;

console.log('\nValidity guard — does this arm reproduce harness-simulate.mjs at defaults?');
console.log('-'.repeat(78));
console.log(
  `  correctness ${(guard.correctnessRate * 100).toFixed(1)}% (published 89.0%), ` +
    `p99 ${guard.p99} (794), tau ${guard.tau.toFixed(3)} (0.643) => ${guardOk ? 'MATCH' : 'DIVERGED'}`
);
if (!guardOk) {
  console.error('\nFAILED: the experiment arm has diverged from the simulator. Sweep aborted.');
  process.exit(1);
}

// ── the sweep ────────────────────────────────────────────────────────────────

const TRAIN = [20260813, 1, 2, 3, 4];
const HOLDOUT = [101, 202, 303, 404, 505];

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

function evaluate(over, seeds) {
  const runs = seeds.map((s) => runHarness(s, over));
  return {
    correctness: mean(runs.map((r) => r.correctnessRate)),
    p99: mean(runs.map((r) => r.p99)),
    p50: mean(runs.map((r) => r.p50)),
    gini: mean(runs.map((r) => r.gini)),
    tau: mean(runs.map((r) => r.tau)),
    failed: mean(runs.map((r) => r.failed)),
    rookieCalls: mean(runs.map((r) => r.rookieCalls)),
    worst: Math.min(...runs.map((r) => r.correctnessRate)),
  };
}

const ARMS = [
  ['control (defaults)', {}],
  ['explorationRate 0.04', { explorationRate: 0.04 }],
  ['explorationRate 0.25', { explorationRate: 0.25 }],
  ['explorationRate 0.40', { explorationRate: 0.4 }],
  ['ucbOptimism 1000', { ucbOptimism: 1000 }],
  ['ucbOptimism 4000', { ucbOptimism: 4000 }],
  ['ucbOptimism 6000', { ucbOptimism: 6000 }],
  ['confidenceK 20', { confidenceK: 20 }],
  ['confidenceK 100', { confidenceK: 100 }],
  ['ledgerAlpha 0.03', { ledgerAlpha: 0.03 }],
  ['ledgerAlpha 0.12', { ledgerAlpha: 0.12 }],
  ['ledgerAlpha 0.25', { ledgerAlpha: 0.25 }],
  ['trustFloor 0', { trustFloor: 0 }],
  ['trustFloor 3500', { trustFloor: 3500 }],
  ['congestionWeight 0.3', { congestionWeight: 0.3 }],
  ['congestionWeight 1.6', { congestionWeight: 1.6 }],
];

const control = evaluate({}, TRAIN);

console.log(`\nOne-factor-at-a-time sweep — TRAIN seeds ${TRAIN.join(', ')} (${TASKS} tasks each)`);
console.log('-'.repeat(78));
console.log(
  `${'arm'.padEnd(24)} ${'correct'.padStart(8)} ${'Δpp'.padStart(7)} ${'worst'.padStart(7)} ${'p99'.padStart(6)} ${'tau'.padStart(6)} ${'gini'.padStart(6)} ${'rookie'.padStart(7)}`
);

const results = [];
for (const [name, over] of ARMS) {
  const r = evaluate(over, TRAIN);
  const dpp = (r.correctness - control.correctness) * 100;
  results.push({ name, over, r, dpp });
  console.log(
    `${name.padEnd(24)} ${(r.correctness * 100).toFixed(1).padStart(7)}% ${(dpp >= 0 ? '+' : '') + dpp.toFixed(2).padStart(6)} ${(r.worst * 100).toFixed(1).padStart(6)}% ${String(Math.round(r.p99)).padStart(6)} ${r.tau.toFixed(3).padStart(6)} ${r.gini.toFixed(3).padStart(6)} ${r.rookieCalls.toFixed(0).padStart(7)}`
  );
}

// ── holdout ──────────────────────────────────────────────────────────────────

const ranked = results.filter((x) => x.name !== 'control (defaults)').sort((a, b) => b.dpp - a.dpp);
const top = ranked.slice(0, 3);

const controlHold = evaluate({}, HOLDOUT);

console.log(`\nHOLDOUT seeds ${HOLDOUT.join(', ')} — these took no part in choosing the arms`);
console.log('-'.repeat(78));
console.log(
  `${'arm'.padEnd(24)} ${'train Δpp'.padStart(10)} ${'hold Δpp'.padStart(10)} ${'verdict'.padStart(22)}`
);
console.log(
  `${'control (defaults)'.padEnd(24)} ${'0.00'.padStart(10)} ${'0.00'.padStart(10)} ${'reference'.padStart(22)}`
);

for (const t of top) {
  const h = evaluate(t.over, HOLDOUT);
  const hdpp = (h.correctness - controlHold.correctness) * 100;
  let verdict;
  if (t.dpp > 0.1 && hdpp > 0.1) verdict = 'holds up';
  else if (t.dpp > 0.1 && hdpp <= 0.1) verdict = 'FITTED TO TRAIN NOISE';
  else verdict = 'no effect';
  console.log(
    `${t.name.padEnd(24)} ${((t.dpp >= 0 ? '+' : '') + t.dpp.toFixed(2)).padStart(10)} ${((hdpp >= 0 ? '+' : '') + hdpp.toFixed(2)).padStart(10)} ${verdict.padStart(22)}`
  );
}

// ── seed spread, to size what counts as a real effect ────────────────────────

const spread = TRAIN.concat(HOLDOUT).map((s) => runHarness(s).correctnessRate);
const lo = Math.min(...spread) * 100;
const hi = Math.max(...spread) * 100;
console.log(
  `\nControl across all 10 seeds: ${lo.toFixed(1)}% – ${hi.toFixed(1)}% (spread ${(hi - lo).toFixed(1)}pp).`
);
console.log(
  `Any arm moving correctness by less than about ${((hi - lo) / 2).toFixed(1)}pp is inside seed noise.`
);


// ── round 2 ──────────────────────────────────────────────────────────────────

console.log(`\n\nROUND 2\n${'='.repeat(78)}`);

// (a) Is trustFloor wired at all? Three settings gave byte-identical results in
// round 1, which is either "never binding" or "dead knob". A knob that cannot
// change anything at any setting is a config option reporting a success it has
// not earned, so push it until it must bite.
console.log(`\n(a) trustFloor — is the knob wired, or dead?`);
console.log('-'.repeat(78));
for (const f of [0, 2000, 3500, 5000, 6500, 8000]) {
  const r = evaluate({ trustFloor: f }, TRAIN);
  console.log(
    `  trustFloor ${String(f).padStart(5)}  correct ${(r.correctness * 100).toFixed(1)}%  ` +
      `p99 ${String(Math.round(r.p99)).padStart(4)}  gini ${r.gini.toFixed(3)}  rookie ${r.rookieCalls.toFixed(0)}`
  );
}

// (b) Finer confidenceK, plus the combination of the two round-1 winners.
console.log(`\n(b) confidenceK detail and combinations — TRAIN then HOLDOUT`);
console.log('-'.repeat(78));
const R2 = [
  ['confidenceK 10', { confidenceK: 10 }],
  ['confidenceK 15', { confidenceK: 15 }],
  ['confidenceK 30', { confidenceK: 30 }],
  ['cK20 + expl 0.25', { confidenceK: 20, explorationRate: 0.25 }],
  ['cK20 + expl 0.40', { confidenceK: 20, explorationRate: 0.4 }],
  ['cK15 + expl 0.40', { confidenceK: 15, explorationRate: 0.4 }],
];
console.log(
  `${'arm'.padEnd(20)} ${'train'.padStart(7)} ${'Δpp'.padStart(7)} ${'hold'.padStart(7)} ${'Δpp'.padStart(7)} ${'p99'.padStart(6)} ${'tau'.padStart(6)} ${'gini'.padStart(6)}`
);
for (const [name, over] of R2) {
  const t = evaluate(over, TRAIN);
  const h = evaluate(over, HOLDOUT);
  const tdpp = (t.correctness - control.correctness) * 100;
  const hdpp = (h.correctness - controlHold.correctness) * 100;
  console.log(
    `${name.padEnd(20)} ${(t.correctness * 100).toFixed(1).padStart(6)}% ${((tdpp >= 0 ? '+' : '') + tdpp.toFixed(2)).padStart(7)} ${(h.correctness * 100).toFixed(1).padStart(6)}% ${((hdpp >= 0 ? '+' : '') + hdpp.toFixed(2)).padStart(7)} ${String(Math.round(h.p99)).padStart(6)} ${h.tau.toFixed(3).padStart(6)} ${h.gini.toFixed(3).padStart(6)}`
  );
}

// (c) THE DECISIVE TEST. Every round-1 winner works by discovering the unknown
// expert faster — and this world was built with a planted gem (rookie, true
// quality 0.95, claims 0). Rewarding exploration in a world designed to reward
// exploration is close to circular. Re-run the winners with the gem removed:
// same unknown expert, mediocre quality 0.50. If "explore more" still wins, it
// is a real improvement. If it loses, the round-1 result is a property of the
// scenario and must not become a default.
console.log(`\n(c) NO-HIDDEN-GEM world — rookie's true quality 0.95 => 0.50`);
console.log('-'.repeat(78));
withPool(EXPERTS_NOGEM, () => {
  const ctrlAll = evaluate({}, TRAIN.concat(HOLDOUT));
  console.log(
    `${'arm'.padEnd(20)} ${'correct'.padStart(8)} ${'Δpp'.padStart(8)} ${'p99'.padStart(6)} ${'tau'.padStart(6)} ${'gini'.padStart(6)} ${'rookie'.padStart(7)}`
  );
  console.log(
    `${'control'.padEnd(20)} ${(ctrlAll.correctness * 100).toFixed(1).padStart(7)}% ${'0.00'.padStart(8)} ${String(Math.round(ctrlAll.p99)).padStart(6)} ${ctrlAll.tau.toFixed(3).padStart(6)} ${ctrlAll.gini.toFixed(3).padStart(6)} ${ctrlAll.rookieCalls.toFixed(0).padStart(7)}`
  );
  for (const [name, over] of [
    ['explorationRate 0.25', { explorationRate: 0.25 }],
    ['explorationRate 0.40', { explorationRate: 0.4 }],
    ['confidenceK 10', { confidenceK: 10 }],
    ['confidenceK 15', { confidenceK: 15 }],
    ['confidenceK 20', { confidenceK: 20 }],
    ['cK20 + expl 0.40', { confidenceK: 20, explorationRate: 0.4 }],
  ]) {
    const r = evaluate(over, TRAIN.concat(HOLDOUT));
    const d = (r.correctness - ctrlAll.correctness) * 100;
    console.log(
      `${name.padEnd(20)} ${(r.correctness * 100).toFixed(1).padStart(7)}% ${((d >= 0 ? '+' : '') + d.toFixed(2)).padStart(8)} ${String(Math.round(r.p99)).padStart(6)} ${r.tau.toFixed(3).padStart(6)} ${r.gini.toFixed(3).padStart(6)} ${r.rookieCalls.toFixed(0).padStart(7)}`
    );
  }
});
