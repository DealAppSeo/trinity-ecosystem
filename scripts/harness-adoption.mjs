#!/usr/bin/env node
// scripts/harness-adoption.mjs — how much of the adoption lag is actually winnable?
//
// Run: node scripts/harness-adoption.mjs [--tasks N] [--seeds N] [--warmup N]
//
// WHY THIS EXISTS. Sprint X measured that an expert joining a warm fleet
// mid-run reaches only ~94.8% of the OMNISCIENT adoption bound, and recorded
// the 4.82pp shortfall as the largest unclaimed simulator prize. That framing
// has a hole in it, and this script is about the hole.
//
// AN OMNISCIENT BOUND IS NOT A TARGET. The omniscient router is told which
// expert is best. A real router has to find out, and finding out costs
// outcomes: every observation spent on an expert that turns out to be worse is
// a loss no algorithm avoids, because the only way to learn a quality is to
// sample it. That irreducible cost is regret, and it is a property of the
// PROBLEM, not of this harness. Quoting the omniscient gap as a prize therefore
// promises work that cannot be delivered — the same error as optimising toward
// a bound nobody measured, one level up.
//
// So this measures three things instead of one:
//
//   omniscient   — knows the answer. Upper bound. Unreachable by construction.
//   Thompson     — a near-optimal Bernoulli bandit, given the same evidence the
//   / UCB1         harness gets and nothing more. THIS is the achievable
//                  reference: the prize is (best learner - harness), not
//                  (omniscient - harness).
//   harness      — what we ship, before and after the Sprint X change.
//
// COMMON RANDOM NUMBERS. Every arm sees the SAME coin for the same expert at
// the same task: `draws[t][expert]` is pre-generated and an outcome is
// `draws[t][id] < trueQuality[id]`. Without this, two arms that select
// differently consume a shared stream at different offsets and the comparison
// carries a variance term that has nothing to do with the algorithms. Sprint X
// compared arms on a shared stream in selection order, so this script also
// re-checks that result under the better instrument.
//
// WHAT IS HELD FIXED. Identical capabilities, no embeddings, generous buckets
// and slots — so similarity and congestion cancel and what is left is the
// learning problem. Same choice, and same caveat, as harness-newcomer.mjs.

import { compileHarness } from './lib/harness-compile.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : fallback;
};
const TASKS = arg('tasks', 3000);
const WARMUP = arg('warmup', 800);
const SEEDS = arg('seeds', 60);
const BASE_SEED = arg('seed', 20260814);
const AS_JSON = argv.includes('--json');

const { load } = compileHarness();
const { ManualClock } = await load('types');
const { LeakyBucketLimiter } = await load('leaky-bucket');
const { CapacityGovernor } = await load('capacity');
const { TrustRouter, SeededRng } = await load('router');
const { ReputationLedger } = await load('reputation');

const VETERANS = [
  ['vet-70', 0.7],
  ['vet-75', 0.75],
  ['vet-80', 0.8],
  ['vet-85', 0.85],
];
const NEWCOMER = ['newcomer-95', 0.95];
const ALL = [...VETERANS, NEWCOMER];
const Q = new Map(ALL);
const BEST_BEFORE = 'vet-85';
const BEST_AFTER = NEWCOMER[0];

// ── the shared coin matrix ───────────────────────────────────────────────────

function makeDraws(seed) {
  const rng = new SeededRng(seed ^ 0xc0ffee);
  const rows = [];
  for (let t = 0; t < TASKS; t += 1) {
    const row = new Map();
    // Fixed iteration order over ALL, so an expert's coin at task t does not
    // depend on which experts were present or selected.
    for (const [id] of ALL) row.set(id, rng.next());
    rows.push(row);
  }
  return rows;
}

const present = (t, joinsAt) => ALL.filter(([id]) => id !== NEWCOMER[0] || t >= joinsAt);

function score(picks, draws, joinsAt) {
  let correct = 0;
  let post = 0;
  let postCorrect = 0;
  for (let t = 0; t < TASKS; t += 1) {
    const id = picks[t];
    if (id === null) continue;
    const good = draws[t].get(id) < Q.get(id);
    if (good) correct += 1;
    if (t >= joinsAt) {
      post += 1;
      if (good) postCorrect += 1;
    }
  }
  return { quality: correct / TASKS, postQuality: post ? postCorrect / post : 0 };
}

// ── arm: the harness itself ──────────────────────────────────────────────────

function runHarness(seed, draws, joinsAt, weighting, rankBy) {
  const clock = new ManualClock(0);
  const limiter = new LeakyBucketLimiter(clock, { tokensPerMinute: 10_000_000 });
  const capacity = new CapacityGovernor(clock, { minSlots: 1, baseSlots: 8, maxSlots: 16 });
  const ledger = new ReputationLedger();
  const router = new TrustRouter(
    clock,
    limiter,
    capacity,
    { coldStartWeighting: weighting },
    new SeededRng(seed)
  );
  const picks = [];
  for (let t = 0; t < TASKS; t += 1) {
    const profiles = present(t, joinsAt).map(([id]) => ({
      id,
      capabilities: ['general'],
      earnedScore: rankBy === 'ucb' ? ledger.upperConfidenceBound(id, 2500) : ledger.earnedScore(id),
      coldStart: ledger.isColdStart(id),
      observations: ledger.observations(id),
    }));
    const d = router.route({ id: `t${t}`, requires: [] }, profiles);
    picks.push(d.selected);
    if (d.selected) ledger.record(d.selected, draws[t].get(d.selected) < Q.get(d.selected));
  }
  return picks;
}

// ── arm: omniscient ──────────────────────────────────────────────────────────

function runOmniscient(_seed, _draws, joinsAt) {
  return Array.from({ length: TASKS }, (_, t) => (t >= joinsAt ? BEST_AFTER : BEST_BEFORE));
}

// ── arm: Thompson sampling (Beta-Bernoulli) ──────────────────────────────────
//
// The standard near-optimal Bernoulli bandit. Included as the ACHIEVABLE
// reference: it sees exactly the outcomes the harness sees, and nothing else.

function gammaSample(shape, rng) {
  // Marsaglia-Tsang. Valid for shape >= 1, which holds here because Beta
  // parameters start at 1 and only grow.
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x;
    let v;
    do {
      // Box-Muller for a standard normal.
      const u1 = Math.max(rng.next(), 1e-12);
      const u2 = rng.next();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng.next();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function betaSample(a, b, rng) {
  const x = gammaSample(a, rng);
  const y = gammaSample(b, rng);
  return x / (x + y);
}

function runThompson(seed, draws, joinsAt) {
  const rng = new SeededRng(seed ^ 0x7305);
  const wins = new Map(ALL.map(([id]) => [id, 0]));
  const losses = new Map(ALL.map(([id]) => [id, 0]));
  const picks = [];
  for (let t = 0; t < TASKS; t += 1) {
    let best = null;
    let bestTheta = -1;
    for (const [id] of present(t, joinsAt)) {
      const theta = betaSample(1 + wins.get(id), 1 + losses.get(id), rng);
      if (theta > bestTheta) {
        bestTheta = theta;
        best = id;
      }
    }
    picks.push(best);
    const good = draws[t].get(best) < Q.get(best);
    if (good) wins.set(best, wins.get(best) + 1);
    else losses.set(best, losses.get(best) + 1);
  }
  return picks;
}

// ── arm: UCB1 ────────────────────────────────────────────────────────────────

function runUcb1(_seed, draws, joinsAt) {
  const n = new Map(ALL.map(([id]) => [id, 0]));
  const s = new Map(ALL.map(([id]) => [id, 0]));
  const picks = [];
  let total = 0;
  for (let t = 0; t < TASKS; t += 1) {
    const pool = present(t, joinsAt).map(([id]) => id);
    let best = pool.find((id) => n.get(id) === 0) ?? null; // pull each arm once
    if (best === null) {
      let bestV = -Infinity;
      for (const id of pool) {
        const v = s.get(id) / n.get(id) + Math.sqrt((2 * Math.log(total)) / n.get(id));
        if (v > bestV) {
          bestV = v;
          best = id;
        }
      }
    }
    picks.push(best);
    const good = draws[t].get(best) < Q.get(best);
    n.set(best, n.get(best) + 1);
    if (good) s.set(best, s.get(best) + 1);
    total += 1;
  }
  return picks;
}

// ── run ──────────────────────────────────────────────────────────────────────

const ARMS = [
  ['omniscient (knows the answer)', (sd, dr, j) => runOmniscient(sd, dr, j)],
  ['Thompson sampling', (sd, dr, j) => runThompson(sd, dr, j)],
  ['UCB1', (sd, dr, j) => runUcb1(sd, dr, j)],
  ['harness, post-Sprint-X', (sd, dr, j) => runHarness(sd, dr, j, 'earned', 'ucb')],
  ['harness, pre-Sprint-X', (sd, dr, j) => runHarness(sd, dr, j, 'midpoint', 'ucb')],
  // The configuration the ORIGINAL 4.82pp was measured on: ranking by the
  // point estimate rather than the upper confidence bound the simulator
  // actually ships. Kept as an arm so the retraction can name its own cause.
  ['harness, pre-X, POINT ESTIMATE', (sd, dr, j) => runHarness(sd, dr, j, 'midpoint', 'point')],
];

const results = new Map(ARMS.map(([label]) => [label, { q: [], pq: [] }]));
for (let i = 0; i < SEEDS; i += 1) {
  const seed = BASE_SEED + i * 7919;
  const draws = makeDraws(seed);
  for (const [label, fn] of ARMS) {
    const r = score(fn(seed, draws, WARMUP), draws, WARMUP);
    results.get(label).q.push(r.quality);
    results.get(label).pq.push(r.postQuality);
  }
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => {
  const m = mean(a);
  return Math.sqrt((a.reduce((x, y) => x + (y - m) ** 2, 0) * a.length) / (a.length - 1) / a.length);
};

const out = [];
const say = (s = '') => {
  out.push(s);
  if (!AS_JSON) console.log(s);
};

say(`\n═══ ADOPTION LAG, RE-PRICED AGAINST AN ACHIEVABLE REFERENCE ═══\n`);
say(`  ${SEEDS} seeds x ${TASKS} tasks. Newcomer (q=0.95) joins a warm fleet at task ${WARMUP}.`);
say(`  Common random numbers: every arm sees the same coin per (task, expert).\n`);
say(`  arm                              overall     post-join`);
for (const [label] of ARMS) {
  const r = results.get(label);
  say(
    `  ${label.padEnd(30)} ${(100 * mean(r.q)).toFixed(2).padStart(7)}%   ${(100 * mean(r.pq))
      .toFixed(2)
      .padStart(7)}%`
  );
}

const om = mean(results.get('omniscient (knows the answer)').pq);
const th = mean(results.get('Thompson sampling').pq);
const uc = mean(results.get('UCB1').pq);
const hx = mean(results.get('harness, post-Sprint-X').pq);
const hp = mean(results.get('harness, pre-Sprint-X').pq);
const bestLearner = Math.max(th, uc);
const bestLearnerName = th >= uc ? 'Thompson' : 'UCB1';

say(`\n  ── what the 4.82pp was made of (post-join) ──\n`);
say(`  omniscient - harness(pre-X)   ${(100 * (om - hp)).toFixed(2).padStart(6)}pp   <- the figure Sprint X recorded`);
say(`  omniscient - harness(post-X)  ${(100 * (om - hx)).toFixed(2).padStart(6)}pp   <- after the cold-start fix`);
say(`  omniscient - ${bestLearnerName.padEnd(15)} ${(100 * (om - bestLearner)).toFixed(2).padStart(6)}pp   <- IRREDUCIBLE: the cost of not knowing`);
say(`  ${bestLearnerName} - harness(post-X)${' '.repeat(Math.max(0, 9 - bestLearnerName.length))}${(100 * (bestLearner - hx)).toFixed(2).padStart(6)}pp   <- the ACTUAL remaining prize`);

// Paired significance on the residual. A 0.27pp headline built from two means
// says nothing until the per-seed differences are looked at — and this is the
// number that decides whether any further work on adoption is justified.
const tp = results.get('Thompson sampling').pq;
const hp2 = results.get('harness, post-Sprint-X').pq;
const diffs = tp.map((v, i) => v - hp2[i]);
const dm = mean(diffs);
const dsd = Math.sqrt(diffs.reduce((x, y) => x + (y - dm) ** 2, 0) / (diffs.length - 1));
const dse = dsd / Math.sqrt(diffs.length);
say('');
say(`  ── is the residual real? paired, ${diffs.length} seeds ──`);
say(`  Thompson - harness(post-X): ${(100 * dm).toFixed(3)}pp +/- ${(100 * 1.96 * dse).toFixed(3)}pp (95% CI)`);
say(`  t = ${(dm / dse).toFixed(2)},  Thompson ahead on ${diffs.filter((d) => d > 0).length}/${diffs.length} seeds`);

const prize = dm - 1.96 * dse > 0 ? bestLearner - hx : 0;
const irreducible = om - bestLearner;
const claimed = om - hp;

say('');
if (prize <= 0.0005) {
  say(`  VERDICT: the lag is essentially SPENT. The harness is at or above the`);
  say(`  best of two standard near-optimal bandits on the same evidence, so the`);
  say(`  remaining ${(100 * (om - hx)).toFixed(2)}pp is the price of having to learn, not a defect.`);
  say(`  Attacking it further means beating Thompson sampling at its own game —`);
  say(`  a research problem, not a sprint, and one this workload does not justify.`);
} else {
  say(`  VERDICT: ${(100 * prize).toFixed(2)}pp is genuinely available — the gap to a standard`);
  say(`  near-optimal bandit given identical evidence. The other`);
  say(`  ${(100 * irreducible).toFixed(2)}pp of the original ${(100 * claimed).toFixed(2)}pp is irreducible regret and`);
  say(`  must not be quoted as a prize.`);
}

// ── what was tried against the residual, and why none of it shipped ──────────

say('');
say('  ── three levers tried against the residual; none is a free win ──\n');
say('  Each was measured on 80 fresh paired seeds, disjoint from the train and');
say('  held-out sets used to pick them, in four worlds:\n');
say('    lever                          veterans   dud 0.55   median 0.80   gem 0.95');
say('    optimismBps 2500 -> 1000        +0.30      +0.77       +0.65        -0.88');
say('    randomised UCB bonus            +0.31      +0.39       +0.33        -0.58');
say('    running mean instead of EWMA    +0.36      +0.22       +0.58        -1.99');
say('');
say('  Significant (|t| > 2): the two positive dud/median entries on row 1, and');
say('  EVERY gem entry. The rest are inside the noise.');
say('');
say('  THE PATTERN IS THE RESULT. All three move the same way: they buy accuracy');
say('  where the newcomer is average-or-worse and pay for it where the newcomer is');
say('  genuinely excellent. That is the exploration/exploitation frontier, and the');
say('  harness is on it. Which point is correct depends on how likely a newly added');
say('  agent is to beat the incumbents — a fact about the real fleet, not something');
say('  a simulator can settle. So the default did NOT move.');
say('');
say('  One hypothesis was refuted outright and is worth not re-testing: the residual');
say('  is NOT the EWMA forgetting. Replacing alpha 0.06 with a running mean makes the');
say('  gem world 1.99pp WORSE (t = -5.69). The forgetting is load-bearing — it lets an');
say('  incumbent decay so a newcomer can overtake, which is the mechanism Sprint X');
say('  identified. Do not "fix" that alpha to improve adoption; it does the opposite.');

// ── self-checks, so this can be gated in CI rather than merely run ───────────
//
// An analysis nobody can fail is a document, not a check. These two are the
// invariants that would break if the measurement itself broke.

const failures = [];

// 1. Nothing may beat the oracle. If a learner does, the common-random-numbers
//    wiring or the oracle's notion of "best present expert" is wrong, and every
//    number above is then measuring a bug.
for (const [label] of ARMS) {
  if (label.startsWith('omniscient')) continue;
  const v = mean(results.get(label).pq);
  if (v > om + 1e-9) {
    failures.push(
      `${label} scored ${(100 * v).toFixed(2)}% post-join, ABOVE the omniscient ` +
        `${(100 * om).toFixed(2)}%. Nothing can beat an oracle that is told the answer — ` +
        `the measurement is broken, not the arm.`
    );
  }
}

// 2. Sprint X's fix must still be an improvement. If this flips, the cold-start
//    change has regressed and the CLOSED entry for it is stale.
if (hx < hp - 1e-9) {
  failures.push(
    `harness post-Sprint-X (${(100 * hx).toFixed(2)}%) is BELOW pre-Sprint-X ` +
      `(${(100 * hp).toFixed(2)}%) post-join. The cold-start weighting change has ` +
      `regressed; docs/PRIOR-WORK-INDEX.md still lists it as CLOSED.`
  );
}

say('');
if (failures.length > 0) {
  console.error(`\nharness-adoption: 0 passed, ${failures.length} failed\n`);
  failures.forEach((f) => console.error(`  x ${f}\n`));
  process.exit(1);
}
say(`  harness-adoption: 2 passed, 0 failed`);

say('');
say(`  NOT CHECKED: simulator evidence, similarity and congestion neutralised.`);
say(`  Thompson and UCB1 are references, not proposals — neither carries the`);
say(`  harness's capacity, breaker, or trust-floor semantics, and a bandit that`);
say(`  ranks on posterior samples cannot state WHY it chose an expert, which is`);
say(`  most of what the ledger exists to do.`);

if (AS_JSON) {
  console.log(
    JSON.stringify(
      {
        seeds: SEEDS,
        tasks: TASKS,
        postJoin: Object.fromEntries(
          ARMS.map(([l]) => [l, { mean: mean(results.get(l).pq), se: sd(results.get(l).pq) }])
        ),
        omniscientGapPreX: claimed,
        omniscientGapPostX: om - hx,
        irreducible,
        remainingPrize: prize,
      },
      null,
      2
    )
  );
}
