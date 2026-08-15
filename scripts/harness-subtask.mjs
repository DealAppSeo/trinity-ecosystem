#!/usr/bin/env node
// scripts/harness-subtask.mjs — is sub-task routing worth reshaping the task model?
//
// Run: node scripts/harness-subtask.mjs [--experts N] [--steps N] [--seeds N]
//
// WHY THIS EXISTS. `docs/TRUST-HARNESS.md` § "Not yet built" calls sub-task
// routing the "highest-value remaining item by impact" and defers it as
// architecturally significant. That impact claim has never been measured. This
// repo's most expensive lesson is two sprints spent optimising a component
// already at 97.9% of its bound, so the claim gets priced before anything is
// reshaped.
//
// THE PRIOR WORK THAT BOUNDS THIS. Sprint V priced per-DOMAIN reputation on real
// data at **+1.64pp volume-weighted** and declined to build it, because it
// rekeys `ReputationLedger` from agent to (agent, domain). Its finding was:
//
//     "the prize is not proportional to the drama"
//
// Ranks scrambled hard across domains — one agent ranked 1st on EVERGREEN and
// 9th on review — yet the volume-weighted gain was small, because the
// high-volume domains had the smallest spreads (+1.70pp, +0.20pp) and the
// dramatic ones (+5.30pp) carried little volume.
//
// Sub-task routing is the SAME mechanism at finer grain, and it costs strictly
// more: it needs the (agent, cell) rekey that was already declined, PLUS a task
// model that has sub-steps at all. So it must clear a higher bar, not a lower one.
//
// WHAT IS MODELLED. A task is S sub-steps, all of which must succeed — the
// conjunctive shape of a real tool-call chain. That deliberately FAVOURS the
// proposal: with a product, routing each step to its best expert compounds,
// because a product of maxima can far exceed the maximum of products. If the
// prize is small even here, it is small.
//
//   per-task routing      one expert does every step:  max_e  PROD_s q[e][s]
//   per-sub-task routing  best expert per step:        PROD_s max_e q[e][s]
//
// The gap between those two omniscient quantities is the CEILING — the most any
// implementation could ever recover. Everything after that is the learning cost.

import { compileHarness } from './lib/harness-compile.mjs';

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : d;
};
const EXPERTS = arg('experts', 8);
const STEPS = arg('steps', 4);
const TASKS = arg('tasks', 3000);
const SEEDS = arg('seeds', 24);
const BASE_SEED = arg('seed', 20260814);
const AS_JSON = argv.includes('--json');

const { load } = compileHarness();
const { SeededRng } = await load('router');
const { ReputationLedger } = await load('reputation');

const say = (s = '') => {
  if (!AS_JSON) console.log(s);
};

/**
 * Build a world at a given specialisation level.
 *
 * `spread` is the only knob that matters. Each expert has a base competence;
 * each (expert, step) cell perturbs it by +/- spread. At spread 0 every expert
 * is equally good at everything and per-step routing cannot possibly help. As
 * spread grows, skills decorrelate and specialists appear.
 */
function makeWorld(rng, spread) {
  const q = [];
  for (let e = 0; e < EXPERTS; e += 1) {
    const base = 0.65 + 0.3 * rng.next(); // 0.65 .. 0.95 per-step competence
    const row = [];
    for (let s = 0; s < STEPS; s += 1) {
      row.push(Math.min(0.995, Math.max(0.05, base + spread * (rng.next() * 2 - 1))));
    }
    q.push(row);
  }
  return q;
}

const prod = (a) => a.reduce((x, y) => x * y, 1);

/** max_e PROD_s q[e][s] — the best single expert for the whole task. */
function omniscientPerTask(q) {
  return Math.max(...q.map(prod));
}

/** PROD_s max_e q[e][s] — the best expert for each step, chosen per step. */
function omniscientPerStep(q) {
  let p = 1;
  for (let s = 0; s < STEPS; s += 1) p *= Math.max(...q.map((row) => row[s]));
  return p;
}

/**
 * Learned routing, using the REAL ledger so the learning cost is the harness's
 * own and not an idealisation.
 *
 * `granular` keys the ledger by `expert::step` instead of `expert`, which is
 * exactly the rekey Sprint V declined for domains. Same traffic either way, so
 * the granular arm is spreading the SAME evidence over STEPS times as many
 * cells — that dilution is the real cost of the proposal and it must be paid
 * inside the measurement, not waved at.
 */
function learned(q, seed, granular) {
  const ledger = new ReputationLedger();
  const rng = new SeededRng(seed ^ 0x5b7a);
  const explore = new SeededRng(seed ^ 0x11ce);
  let succeeded = 0;

  for (let t = 0; t < TASKS; t += 1) {
    let taskOk = true;
    for (let s = 0; s < STEPS; s += 1) {
      const key = (e) => (granular ? `e${e}::s${s}` : `e${e}`);
      // 10% exploration, matching the router's default; without it a granular
      // ledger never fills its cells and the comparison measures starvation.
      let pick;
      if (explore.next() < 0.1) {
        pick = Math.floor(explore.next() * EXPERTS);
      } else {
        let best = -1;
        let bestScore = -Infinity;
        for (let e = 0; e < EXPERTS; e += 1) {
          const v = ledger.upperConfidenceBound(key(e), 2500);
          if (v > bestScore) {
            bestScore = v;
            best = e;
          }
        }
        pick = best;
      }
      const ok = rng.next() < q[pick][s];
      ledger.record(key(pick), ok);
      if (!ok) taskOk = false;
      // A failed step still consumes the rest of the chain in this model: every
      // step is attempted so that all cells receive evidence. Stopping early
      // would starve later steps and flatter the per-task arm.
    }
    if (taskOk) succeeded += 1;
  }
  return succeeded / TASKS;
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const se = (a) => {
  const m = mean(a);
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1) / a.length);
};

say(`\n═══ SUB-TASK ROUTING, PRICED BEFORE RESHAPING ANYTHING ═══\n`);
say(`  ${EXPERTS} experts, ${STEPS} sub-steps per task (all must succeed), ${TASKS} tasks, ${SEEDS} seeds.`);
say(`  "spread" is per-(expert,step) deviation from the expert's base competence:`);
say(`  0.00 = no specialisation at all, 0.30 = skills essentially uncorrelated.\n`);
say(`  spread |  omni per-task  omni per-STEP  |  CEILING  |  learned/task  learned/STEP  |  ACHIEVED`);

const rows = [];
for (const spread of [0, 0.05, 0.1, 0.15, 0.2, 0.3]) {
  const oT = [];
  const oS = [];
  const lT = [];
  const lS = [];
  for (let i = 0; i < SEEDS; i += 1) {
    const seed = BASE_SEED + i * 7919;
    const q = makeWorld(new SeededRng(seed), spread);
    oT.push(omniscientPerTask(q));
    oS.push(omniscientPerStep(q));
    lT.push(learned(q, seed, false));
    lS.push(learned(q, seed, true));
  }
  const ceiling = mean(oS) - mean(oT);
  const achieved = mean(lS) - mean(lT);
  const d = lS.map((v, i) => v - lT[i]);
  rows.push({ spread, ceiling, achieved, t: mean(d) / se(d), oT: mean(oT), oS: mean(oS), lT: mean(lT), lS: mean(lS) });
  say(
    `   ${spread.toFixed(2)}  |    ${(100 * mean(oT)).toFixed(2)}%        ${(100 * mean(oS)).toFixed(2)}%     ` +
      `| ${(100 * ceiling).toFixed(2).padStart(6)}pp  |    ${(100 * mean(lT)).toFixed(2)}%        ${(100 * mean(lS)).toFixed(2)}%     ` +
      `| ${((achieved >= 0 ? '+' : '') + (100 * achieved).toFixed(2)).padStart(7)}pp  t=${(mean(d) / se(d)).toFixed(1)}`
  );
}

say(`\n  CEILING  = what perfect sub-task routing would buy (omniscient − omniscient).`);
say(`  ACHIEVED = what the harness's own ledger recovers, paying the dilution cost`);
say(`             of spreading the same traffic over ${STEPS}× as many cells.\n`);

// ── the comparison that decides it ───────────────────────────────────────────

const SPRINT_V = 1.64; // pp, volume-weighted, REAL data — per-domain reputation
say(`  ── against the bar this has to clear ──\n`);
say(`  Sprint V priced per-DOMAIN reputation on REAL data at +${SPRINT_V}pp volume-weighted`);
say(`  and declined to build it: it rekeys ReputationLedger from agent to`);
say(`  (agent, domain), touching persistence, the router and an unapplied`);
say(`  migration. Sub-task routing needs that SAME rekey plus a task model with`);
say(`  sub-steps, so it must clear a HIGHER bar than +${SPRINT_V}pp, not a lower one.\n`);

const payAt = rows.filter((r) => 100 * r.achieved > SPRINT_V);
if (payAt.length === 0) {
  say(`  At NO tested specialisation level does the achieved gain exceed +${SPRINT_V}pp.`);
} else {
  say(`  Achieved gain exceeds +${SPRINT_V}pp only at spread >= ${payAt[0].spread.toFixed(2)}`);
  say(`  (${(100 * payAt[0].achieved).toFixed(2)}pp). Below that the finer-grained mechanism costs more`);
  say(`  than the one already declined and returns less.`);
}

// ── scope correction: what this would actually cost to build ────────────────

say(`  ── the cost side, checked against the code rather than assumed ──\n`);
say(`  TRUST-HARNESS.md says this "reshapes the task model and router.ts rather`);
say(`  than adding to them". Half of that is wrong:\n`);
say(`  * router.ts needs NO change. TrustRouter holds no per-task state — route()`);
say(`    is a pure function of its arguments — so calling it once per sub-step`);
say(`    already works today.`);
say(`  * ReputationLedger needs NO change. It keys on an opaque string, so`);
say(`    \`record('agent::step', ok)\` is legal now. This script proves it: the`);
say(`    granular arm above drives the REAL ledger with composite keys.`);
say(`  * The call site keys trust per (agent, step) while keeping id per AGENT,`);
say(`    so capacity, rate limits and breakers stay agent-scoped:\n`);
say(`        profiles = agents.map((a) => ({`);
say(`          id: a.id,                                   // capacity/limits: per AGENT`);
say(`          earnedScore: led.upperConfidenceBound(\`\${a.id}::\${step}\`),`);
say(`          coldStart:   led.isColdStart(\`\${a.id}::\${step}\`),`);
say(`          observations: led.observations(\`\${a.id}::\${step}\`),  // per (agent, step)`);
say(`        }));\n`);
say(`  * PERSISTENCE is the one real blocker. supabase-reputation-store.ts has`);
say(`    primary key \`agent_name\`, a single text column, so per-step scores`);
say(`    cannot be stored. In-memory sub-task reputation works today; surviving a`);
say(`    restart needs the rekey Sprint V declined.\n`);
say(`  Sprint X also made this more viable than it was: granular cells are thin by`);
say(`  construction, and the old flat-0.5 cold-start rule discarded every`);
say(`  observation in a thin cell. \`observations\` on the profile is what lets a`);
say(`  cell with 6 outcomes rank on those 6 outcomes.\n`);

say(`\n  WHAT THE REAL FLEET LOOKS LIKE — the part a simulator cannot supply.`);
say(`  Sprint V's real-data table is the only measured evidence of specialisation`);
say(`  in this fleet, and its lesson was "the prize is not proportional to the`);
say(`  drama": ranks scrambled hard (1st on EVERGREEN, 9th on review) while the`);
say(`  volume-weighted gain stayed at +${SPRINT_V}pp, because the two HIGH-VOLUME`);
say(`  domains had the smallest spreads (+1.70pp, +0.20pp). Locating the fleet on`);
say(`  the curve above needs per-(agent, sub-step) success rates, which do not`);
say(`  exist — \`repid_score_events\` has no task key, the same blocker that stops`);
say(`  co-failure. That is the measurement to take BEFORE building this.\n`);

// ── self-check, so this is gateable rather than merely runnable ─────────────
//
// At spread 0 every expert is equally good at every step, so per-step routing
// has NOTHING to find and the two arms must tie. If the granular arm wins there,
// the model is biased in its favour and every number above is inflated. This is
// the one invariant that catches that.

const zero = rows.find((r) => r.spread === 0);
const failures = [];
if (Math.abs(100 * zero.ceiling) > 0.01) {
  failures.push(
    `at spread 0 the omniscient arms must be identical (max of products == product of maxes ` +
      `when every row is flat); ceiling is ${(100 * zero.ceiling).toFixed(3)}pp.`
  );
}
if (Math.abs(100 * zero.achieved) > 0.5) {
  failures.push(
    `at spread 0 per-step routing has nothing to find, so the arms must tie; ` +
      `granular is ${(100 * zero.achieved).toFixed(2)}pp ahead. The model favours the proposal.`
  );
}
if (!(rows[rows.length - 1].achieved > rows[0].achieved)) {
  failures.push('gain does not increase with specialisation; the spread knob is not doing anything.');
}

if (failures.length > 0) {
  console.error(`\nharness-subtask: 0 passed, ${failures.length} failed\n`);
  failures.forEach((f) => console.error(`  x ${f}\n`));
  process.exit(1);
}
say(`  harness-subtask: 3 passed, 0 failed\n`);

if (AS_JSON) console.log(JSON.stringify({ experts: EXPERTS, steps: STEPS, seeds: SEEDS, rows }, null, 2));
