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
const { QuorumEvaluator } = await load('quorum');
const { PluralityAggregator } = await load('aggregate');

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

// HANG UNDER TRUST — the scenario timeout.ts actually exists for, and the one
// the main simulation cannot show.
//
// `stalled` in the default pool is demoted within a handful of calls, so the
// timeout has almost nothing left to catch and its ablation sits inside seed
// noise. That is the EASY case. The hard case is an expert that has genuinely
// EARNED its reputation over hundreds of observations and then starts hanging.
//
// It is hard precisely because of the shrinkage that fixed the original tau
// 0.429 defect: an earned score is weighted n/(n+k), so an expert with many
// observations moves slowly BY DESIGN. That is correct behaviour — it is what
// stops a lucky 15-observation streak outranking a 757-observation record — and
// it is exactly what keeps traffic flowing to a veteran that has just gone bad.
// The mechanism that fixed one failure is what makes this one bite.
const EXPERTS_VETERAN = [
  ...EXPERTS_BASE.filter((e) => e.id !== 'stalled'),
  // Decisively the best expert in the pool on every axis, and it does not go bad
  // until 75% through. Both are required, and the FIRST ATTEMPT AT THIS SCENARIO
  // GOT BOTH WRONG: quality 0.93 (merely comparable to alpha) and hangsAt 0.6
  // gave it 4 calls all run and 0 before it went bad. It was `stalled` wearing a
  // different name — a cold expert that hangs — and the ablation it produced was
  // measuring nothing. `assertTrusted` below now refuses to report unless the
  // scenario actually instantiated the case.
  { id: 'veteran', caps: ['hal'], trueQuality: 0.97, baseLatency: 90, errorRate: 0.01,
    claimedScore: 7500, capacity: 400, hangsAt: 0.75, hangRate: 0.5 },
];

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
  confidenceK: 20,
  coldStartConfidence: 0.5,
};

/** Faithful copy of runHarness() from harness-simulate.mjs, parameterised. */
function runHarness(seed, over = {}) {
  const { noTimeout = false, warmStart = null, panelSize = 0,
          aggregate = false, scatterWrong = false, ...rest } = over;
  const P = { ...DEFAULTS, ...rest };
  const world = makeWorld(seed);
  const clock = new ManualClock(0);

  const perExpert = new Map(EXPERTS.map((e) => [e.id, 0]));
  const latencies = [];
  let completed = 0;
  let correct = 0;
  let failed = 0;
  let hangsHit = 0;
  let hangStallMs = 0;
  let postHangCalls = 0;
  let preHangCalls = 0;
  let qCommit = 0, qReject = 0, qIndet = 0;
  let pluralityCorrect = 0;

  const limiter = new LeakyBucketLimiter(clock, { tokensPerMinute: 600 });
  for (const e of EXPERTS) limiter.configure(e.id, { tokensPerMinute: e.capacity });

  const capacity = new CapacityGovernor(clock, {
    baseSlots: 6, minSlots: 1, maxSlots: 12,
    warmupSamples: 5, degradedRatio: 1.5, alpha: 0.3,
  });
  const breakers = new CircuitBreakerRegistry(clock, {
    thresholdFailures: 3, resetTimeoutMs: 30_000, successesToClose: 2,
  });
  // MoA panel. panelSize 0 keeps the existing top-1 path byte-for-byte, which is
  // what lets the validity guard above still reproduce the simulator.
  //
  // faultTolerance 0 disables the n >= 3f+1 structural check, because that check
  // is about Byzantine validators in a consensus round, not about how many
  // proposers we chose to ask. Leaving it on would return INDETERMINATE for every
  // panel smaller than 4 and silently score the whole arm as wrong.
  // supermajority is left at the PBFT default of 2/3. The module REFUSES 0.5 —
  // "supermajority must be in (0.5, 1)" — and that guard is right, so the panel
  // bends to it rather than the reverse. The consequence is deliberate and
  // conservative: a panel that merely splits does not commit, and an
  // INDETERMINATE round is scored as NOT correct.
  // The real module, not the second scoring lens used to justify building it.
  const plurality = new PluralityAggregator(clock, { minProposals: 2 });

  const panel = new QuorumEvaluator(clock, {
    minValidators: Math.max(1, panelSize),
    faultTolerance: 0,
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
  // A veteran does not earn its reputation during the window you observe it in —
  // it arrives holding one. Seeding the ledger models an incumbent with a track
  // record, which is the only way to instantiate "hang under trust": with default
  // parameters a cold expert takes almost no early traffic (measured: `rookie`
  // and `veteran` both took 0 calls in the first 60% of a run), so no newcomer
  // can build trust inside the run and then lose it.
  if (warmStart) {
    for (const [id, n] of Object.entries(warmStart)) {
      for (let i = 0; i < n; i += 1) ledger.record(id, true);
    }
  }

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

    if (panelSize > 0) {
      const d = router.route(task, profiles(), { isCircuitOpen: (id) => breakers.isOpen(id) });
      const members = [d.selected, ...d.alternates].filter(Boolean).slice(0, panelSize);
      if (members.length === 0) {
        failed += 1;
        continue;
      }
      const votes = [];
      let slowest = 0;
      for (const id of members) {
        const expert = EXPERTS.find((e) => e.id === id);
        limiter.tryConsume(id, 1);
        capacity.acquire(id);
        const r = world.call(expert, progress);
        capacity.release(id);
        perExpert.set(id, perExpert.get(id) + 1);

        if (r.hang) {
          hangsHit += 1;
          hangStallMs += IDLE_TIMEOUT_MS;
          slowest = Math.max(slowest, IDLE_TIMEOUT_MS);
          capacity.observe(id, IDLE_TIMEOUT_MS, false);
          breakers.recordFailure(id);
          updateEarned(id, false);
          continue;
        }
        slowest = Math.max(slowest, r.latencyMs);
        capacity.observe(id, r.latencyMs, r.ok);
        if (r.ok) {
          breakers.recordSuccess(id);
          updateEarned(id, r.correct);
          // CONSERVATIVE MODELLING. A correct answer is an 'approve', a wrong one
          // a 'reject', so wrong answers are counted as a single agreeing bloc.
          // In reality there are many ways to be wrong and one way to be right,
          // so incorrect answers scatter and fail to form a plurality. Treating
          // them as a bloc UNDERSTATES the panel's benefit — chosen deliberately,
          // because the opposite assumption would manufacture the result.
          // scatterWrong models reality: there are many ways to be wrong and
          // one way to be right, so incorrect answers do NOT agree with each
          // other. The bloc model (scatterWrong false) is the conservative
          // bound that was used to justify building this module; both are
          // measured so the truth is bracketed rather than asserted.
          const key = r.correct ? 'right' : scatterWrong ? `wrong:${id}` : 'wrong';
          votes.push({ validator: id, verdict: r.correct ? 'approve' : 'reject',
                       earnedScore: ledger.earnedScore(id),
                       key, answer: key, expert: id });
        } else {
          breakers.recordFailure(id);
          updateEarned(id, false);
        }
      }

      // A panel pays the SLOWEST member, not the sum: the calls are concurrent.
      latencies.push(slowest || 200);

      if (votes.length === 0) {
        failed += 1;
        continue;
      }
      if (aggregate) {
        const a = plurality.aggregate(
          votes.map((v) => ({ expert: v.expert, key: v.key, answer: v.answer,
                              earnedScore: v.earnedScore }))
        );
        completed += 1;
        if (a.outcome === 'DECIDED' && a.key === 'right') correct += 1;
        continue;
      }

      const verdictResult = panel.evaluate(votes);
      // SECOND SCORING LENS ON THE SAME VOTES — no new module, no re-run.
      // A real MoA aggregator returns the plurality answer rather than
      // abstaining, so this asks what the identical panel would have scored
      // under plurality semantics. It is a diagnostic, not a proposed default.
      if (verdictResult.approveWeight > verdictResult.rejectWeight) pluralityCorrect += 1;
      if (verdictResult.outcome === 'COMMIT') qCommit += 1;
      else if (verdictResult.outcome === 'REJECT') qReject += 1;
      else qIndet += 1;
      completed += 1;
      if (verdictResult.outcome === 'COMMIT') correct += 1;
      continue;
    }

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
      if (expert.hangsAt !== undefined) {
        if (progress >= expert.hangsAt) postHangCalls += 1;
        else preHangCalls += 1;
      }

      if (r.hang && noTimeout) {
        // No idle deadline. The hang is bounded only by the run deadline, and
        // because nothing ever completes there is NO failure to record — the
        // breaker, the governor and the ledger all learn nothing at all.
        hangsHit += 1;
        hangStallMs += RUN_TIMEOUT_MS;
        latencies.push(RUN_TIMEOUT_MS);
        clock.advance(RUN_TIMEOUT_MS);
        capacity.release(id);
        continue;
      }

      if (r.hang) {
        hangsHit += 1;
        clock.advance(IDLE_TIMEOUT_MS);
        const expired = timeouts.sweep();
        capacity.release(id);
        for (const e of expired) {
          hangStallMs += e.elapsedMs;
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
    hangStallMs,
    callsPerTask: [...perExpert.values()].reduce((a, b) => a + b, 0) / TASKS,
    qCommit, qReject, qIndet,
    pluralityRate: pluralityCorrect / TASKS,
    panelAnyCorrect: 0,
    postHangCalls,
    preHangCalls,
    hangerConfidence: (() => {
      const h = EXPERTS.find((e) => e.hangsAt !== undefined);
      return h ? ledger.view(h.id).confidence : 0;
    })(),
    hangerObs: (() => {
      const h = EXPERTS.find((e) => e.hangsAt !== undefined);
      return h ? ledger.observations(h.id) : 0;
    })(),
    rookieCalls: perExpert.get('rookie'),
    perExpert: Object.fromEntries(perExpert),
  };
}

// ── validity guard ───────────────────────────────────────────────────────────
//
// This arm is a copy. If it has drifted from harness-simulate.mjs the sweep is
// measuring something else, so refuse to report rather than report a number
// that cannot be reproduced by the published simulator.

// Updated 2026-08-13 when confidenceK's default moved 50 -> 20. These are the
// numbers harness-simulate.mjs now publishes; if this arm stops reproducing
// them the sweep is measuring something the simulator does not.
const PUBLISHED = { seed: 20260813, correctnessRate: 0.9225, p99: 179, tau: 0.643 };
const guard = runHarness(PUBLISHED.seed);
const guardOk =
  Math.abs(guard.correctnessRate - PUBLISHED.correctnessRate) < 0.0005 &&
  guard.p99 === PUBLISHED.p99 &&
  Math.abs(guard.tau - PUBLISHED.tau) < 0.0005;

console.log('\nValidity guard — does this arm reproduce harness-simulate.mjs at defaults?');
console.log('-'.repeat(78));
// Interpolate from PUBLISHED rather than repeating the numbers as literals.
// They were literals until 2026-08-13, and the moment PUBLISHED was updated the
// message read "correctness 92.3% (published 89.0%) ... => MATCH" — a guard
// against drift that had itself drifted, and said MATCH while printing a
// mismatch.
console.log(
  `  correctness ${(guard.correctnessRate * 100).toFixed(1)}% (published ${(PUBLISHED.correctnessRate * 100).toFixed(1)}%), ` +
    `p99 ${guard.p99} (${PUBLISHED.p99}), tau ${guard.tau.toFixed(3)} (${PUBLISHED.tau.toFixed(3)}) ` +
    `=> ${guardOk ? 'MATCH' : 'DIVERGED'}`
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
    hangsHit: mean(runs.map((r) => r.hangsHit)),
    callsPerTask: mean(runs.map((r) => r.callsPerTask)),
    qCommit: mean(runs.map((r) => r.qCommit)),
    qReject: mean(runs.map((r) => r.qReject)),
    qIndet: mean(runs.map((r) => r.qIndet)),
    pluralityRate: mean(runs.map((r) => r.pluralityRate)),
    hangStallMs: mean(runs.map((r) => r.hangStallMs)),
    postHangCalls: mean(runs.map((r) => r.postHangCalls)),
    preHangCalls: mean(runs.map((r) => r.preHangCalls)),
    hangerConfidence: mean(runs.map((r) => r.hangerConfidence)),
    hangerObs: mean(runs.map((r) => r.hangerObs)),
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
  ['confidenceK 50 (old default)', { confidenceK: 50 }],
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

// ── (d) HANG UNDER TRUST ─────────────────────────────────────────────────────
//
// The scenario timeout.ts exists for. `veteran` earns genuinely for 60% of the
// run — high quality, low latency, hundreds of observations — and then starts
// hanging on 45% of its calls without ever erroring.
//
// The ablation here is the honest A/B for the module: identical world, identical
// seeds, timeout policy on versus off. In the default pool this comparison sat
// inside seed noise because `stalled` was demoted before the timeout mattered.

console.log(`\n\n(d) HANG UNDER TRUST — a veteran with earned reputation starts hanging`);
console.log('='.repeat(78));

withPool(EXPERTS_VETERAN, () => {
  const ALL = TRAIN.concat(HOLDOUT);
  const WARM = { veteran: 400 };
  const off = evaluate({ noTimeout: true, warmStart: WARM }, ALL);
  const on = evaluate({ warmStart: WARM }, ALL);

  const row2 = (label, a, b, fmt = (x) => String(Math.round(x)), invert = true) => {
    const delta = a === 0 ? (b === 0 ? '0' : 'n/a') : `${(((b - a) / Math.abs(a)) * 100).toFixed(1)}%`;
    const better = a === 0 ? '' : invert ? (b < a ? '✓' : '✗') : b > a ? '✓' : '✗';
    return `${label.padEnd(30)} ${fmt(a).padStart(12)} ${fmt(b).padStart(12)}   ${delta.padStart(8)} ${better}`;
  };

  // SCENARIO VALIDITY GUARD. This section claims to measure a hang under
  // *trust*. If the veteran never accumulated trust before going bad, it is
  // just another cold staller and the ablation below measures nothing. The
  // first version of this scenario failed exactly that way — 4 calls all run,
  // 0 before it went bad — and printed a confident, meaningless table. Prove
  // the case was instantiated before reporting on it.
  const trusted = off.preHangCalls >= 200 && off.hangerConfidence >= 0.8;
  console.log(
    `\n  Scenario validity: veteran took ${off.preHangCalls.toFixed(0)} calls BEFORE going bad, ` +
      `ending confidence ${off.hangerConfidence.toFixed(2)} on ${off.hangerObs.toFixed(0)} observations.`
  );
  console.log(
    `  Needs >=200 pre-hang calls and >=0.80 confidence to count as "under trust" => ${trusted ? 'VALID' : 'INVALID'}`
  );
  if (!trusted) {
    console.log(
      `\n  SCENARIO INVALID — the veteran never earned trust, so this is a cold staller,\n` +
        `  not a hang under trust. No ablation reported: it would measure nothing.`
    );
    return;
  }

  console.log(
    `\n  10 seeds, ${TASKS} tasks. veteran: quality 0.97, warm-started with 400 good\n` +
      `  observations (an incumbent with a track record), hangs 50% of calls from 75% onward.\n`
  );
  console.log(`${''.padEnd(30)} ${'timeout OFF'.padStart(12)} ${'timeout ON'.padStart(12)}      delta`);
  console.log('-'.repeat(78));
  console.log(row2('correctness rate', off.correctness, on.correctness, (x) => `${(x * 100).toFixed(1)}%`, false));
  console.log(row2('unrecovered failures', off.failed, on.failed));
  console.log(row2('calls to veteran once bad', off.postHangCalls, on.postHangCalls));
  console.log(row2('hangs encountered', off.hangsHit, on.hangsHit));
  console.log(row2('wall clock lost to hangs (s)', off.hangStallMs / 1000, on.hangStallMs / 1000, (x) => x.toFixed(1)));
  console.log(row2('p99 latency (ms)', off.p99, on.p99));
  console.log(row2('Kendall tau', off.tau, on.tau, (x) => x.toFixed(3), false));
  console.log(row2('load Gini', off.gini, on.gini, (x) => x.toFixed(3)));

  const dpp = (on.correctness - off.correctness) * 100;
  console.log(
    `\n  Correctness delta ${dpp >= 0 ? '+' : ''}${dpp.toFixed(2)}pp. Seed noise on this pool is measured below;` +
      `\n  anything inside it is not an effect, however good the story sounds.`
  );
  const spreadV = ALL.map((s) => runHarness(s, { noTimeout: true, warmStart: WARM }).correctnessRate);
  const loV = Math.min(...spreadV) * 100;
  const hiV = Math.max(...spreadV) * 100;
  console.log(`  timeout-OFF control across the same 10 seeds: ${loV.toFixed(1)}% – ${hiV.toFixed(1)}% (spread ${(hiV - loV).toFixed(1)}pp).`);
});

// ── (e) MoA PANEL — does aggregating beat top-1? ─────────────────────────────
//
// QuorumEvaluator was imported by harness-simulate.mjs and never used: we built
// PBFT aggregation with 46 assertions behind it and never aggregated. This is
// that wiring, measured. Votes are weighted by EARNED reputation, which is the
// one thing the MoA literature does not do — it aggregates uniformly or by a
// learned gate, with no notion of a proposer that lies.

console.log(`\n\n(e) MoA PANEL — weighted aggregation vs top-1 routing`);
console.log('='.repeat(78));
const ALL10 = TRAIN.concat(HOLDOUT);
const base = evaluate({}, ALL10);
console.log(
  `${'arm'.padEnd(22)} ${'correct'.padStart(8)} ${'Δpp'.padStart(8)} ${'calls/task'.padStart(11)} ${'p99'.padStart(6)} ${'tau'.padStart(6)}`
);
console.log(
  `${'top-1 (control)'.padEnd(22)} ${(base.correctness * 100).toFixed(1).padStart(7)}% ${'0.00'.padStart(8)} ${base.callsPerTask.toFixed(2).padStart(11)} ${String(Math.round(base.p99)).padStart(6)} ${base.tau.toFixed(3).padStart(6)}`
);
for (const k of [2, 3, 4]) {
  const r = evaluate({ panelSize: k }, ALL10);
  const d = (r.correctness - base.correctness) * 100;
  console.log(
    `${('panel of ' + k).padEnd(22)} ${(r.correctness * 100).toFixed(1).padStart(7)}% ${((d >= 0 ? '+' : '') + d.toFixed(2)).padStart(8)} ${r.callsPerTask.toFixed(2).padStart(11)} ${String(Math.round(r.p99)).padStart(6)} ${r.tau.toFixed(3).padStart(6)}`
  );
}

// DIAGNOSIS, not a guess. If the loss is dominated by INDETERMINATE rounds then
// what was measured is a fail-closed unanimity gate, not aggregation.
console.log(`\n  Same votes, scored two ways — supermajority gate vs plurality aggregator:`);
console.log(`  ${'panel'.padEnd(10)} ${'gate'.padStart(8)} ${'plurality'.padStart(10)} ${'Δpp vs top-1'.padStart(13)}`);
for (const k of [2, 3, 4]) {
  const r = evaluate({ panelSize: k }, ALL10);
  const dp = (r.pluralityRate - base.correctness) * 100;
  console.log(
    `  ${String(k).padEnd(10)} ${(r.correctness * 100).toFixed(1).padStart(7)}% ${(r.pluralityRate * 100).toFixed(1).padStart(9)}% ${((dp >= 0 ? '+' : '') + dp.toFixed(2)).padStart(13)}`
  );
}

console.log(`\n  Quorum outcome mix per run (of ${TASKS} tasks):`);
console.log(`  ${'panel'.padEnd(10)} ${'COMMIT'.padStart(8)} ${'REJECT'.padStart(8)} ${'INDETERMINATE'.padStart(14)}`);
for (const k of [2, 3, 4]) {
  const r = evaluate({ panelSize: k }, ALL10);
  console.log(
    `  ${String(k).padEnd(10)} ${r.qCommit.toFixed(0).padStart(8)} ${r.qReject.toFixed(0).padStart(8)} ${r.qIndet.toFixed(0).padStart(14)}`
  );
}

// ── (f) THE REAL AGGREGATOR ──────────────────────────────────────────────────
//
// Section (e) scored recorded votes under plurality semantics as a diagnostic.
// This runs the shipped PluralityAggregator instead, and brackets the answer
// model: `bloc` counts every wrong answer as the same wrong answer (the
// conservative bound used to justify the build), `scatter` gives each wrong
// answer its own key, which is what actually happens.

console.log(`\n\n(f) PluralityAggregator — the shipped module, not a scoring lens`);
console.log('='.repeat(78));
console.log(
  `${'arm'.padEnd(28)} ${'correct'.padStart(8)} ${'Δpp'.padStart(8)} ${'calls/task'.padStart(11)} ${'p99'.padStart(6)}`
);
console.log(
  `${'top-1 (control)'.padEnd(28)} ${(base.correctness * 100).toFixed(1).padStart(7)}% ${'0.00'.padStart(8)} ${base.callsPerTask.toFixed(2).padStart(11)} ${String(Math.round(base.p99)).padStart(6)}`
);
for (const k of [2, 3, 4]) {
  for (const [label, scatter] of [['bloc', false], ['scatter', true]]) {
    const r = evaluate({ panelSize: k, aggregate: true, scatterWrong: scatter }, ALL10);
    const d = (r.correctness - base.correctness) * 100;
    console.log(
      `${(`panel ${k}, wrong=${label}`).padEnd(28)} ${(r.correctness * 100).toFixed(1).padStart(7)}% ${((d >= 0 ? '+' : '') + d.toFixed(2)).padStart(8)} ${r.callsPerTask.toFixed(2).padStart(11)} ${String(Math.round(r.p99)).padStart(6)}`
    );
  }
}

// The same gate every other change has had to pass: does it survive the world
// with the planted excellent expert removed? A panel gain that only exists
// because there is a gem to find would be the explorationRate artefact again.
console.log(`\n  NO-HIDDEN-GEM counterfactual (rookie 0.95 -> 0.50), wrong=scatter:`);
withPool(EXPERTS_NOGEM, () => {
  const ctrl = evaluate({}, ALL10);
  console.log(`  ${'top-1 (control)'.padEnd(24)} ${(ctrl.correctness * 100).toFixed(1).padStart(7)}%`);
  for (const k of [2, 3, 4]) {
    const r = evaluate({ panelSize: k, aggregate: true, scatterWrong: true }, ALL10);
    const d = (r.correctness - ctrl.correctness) * 100;
    console.log(
      `  ${('panel of ' + k).padEnd(24)} ${(r.correctness * 100).toFixed(1).padStart(7)}% ${((d >= 0 ? '+' : '') + d.toFixed(2)).padStart(8)}pp`
    );
  }
});
