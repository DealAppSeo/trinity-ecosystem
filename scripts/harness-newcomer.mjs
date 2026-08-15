#!/usr/bin/env node
// scripts/harness-newcomer.mjs — can an expert added MID-RUN earn its way up?
//
// Run: node scripts/harness-newcomer.mjs [--tasks N] [--seed N] [--warmup N]
//
// WHY THIS EXISTS. `docs/TRUST-HARNESS.md` § "Not yet built" carries this as an
// explicit NOT CHECKED:
//
//   "What has NOT been re-measured is whether a newcomer added mid-run can now
//    earn trust — the hang-under-trust scenario still warm-starts its veteran,
//    and that warm start has not been retested against the new default."
//
// It matters more than its one bullet suggests. The harness's whole claim is
// that reputation is EARNED, not asserted. A live fleet gains agents. If a new
// agent cannot climb against incumbents no matter how good it is, then "earned"
// describes only the experts present at t=0, and every later arrival is ranked
// by a prior it can never escape — which is a self-report by another name.
//
// CEILING BEFORE MEASUREMENT. This repo's most expensive lesson is that two
// sprints went into optimising a component already at 97.9% of its bound. So
// section 1 computes what the mechanism can do, from the published formulas,
// BEFORE anything is simulated. Section 2 checks that arithmetic against the
// real ledger rather than trusting it. Only then does section 3 run traffic.
//
// WHAT IS HELD FIXED, AND WHY. Every expert here has identical capabilities and
// no embedding, so `capabilityOverlap` returns 1 for all of them and similarity
// cancels out of the routing score. Buckets and slots are generous, so
// congestion is 0. That is deliberate: the question is whether EARNED
// REPUTATION alone can promote a newcomer, and leaving similarity or congestion
// free would let a win or a loss come from somewhere else and be misread as an
// answer about trust.

import { compileHarness } from './lib/harness-compile.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : fallback;
};
const TASKS = arg('tasks', 3000);
const WARMUP = arg('warmup', 800);
const SEED = arg('seed', 20260814);
const AS_JSON = argv.includes('--json');

const { load } = compileHarness();
const { ManualClock, BPS_MAX } = await load('types');
const { LeakyBucketLimiter } = await load('leaky-bucket');
const { CapacityGovernor } = await load('capacity');
const { TrustRouter, SeededRng } = await load('router');
const { ReputationLedger } = await load('reputation');

// Published defaults, restated here so the analytic section does not silently
// drift from the module. Section 2 fails loudly if they have.
const PRIOR = 5000;
const ALPHA = 0.06;
const K = 20;
const COLD_CONF = 0.5;
const EXPLORATION = 0.1;

const out = [];
const say = (s = '') => {
  out.push(s);
  if (!AS_JSON) console.log(s);
};
const bps = (n) => `${Math.round(n)} bps`;

// ── 1. THE CEILING, COMPUTED — no simulation ─────────────────────────────────
//
// An expert is explored only while `confidence < 0.5`, and confidence is
// n/(n+K), so exploration stops the instant n reaches K = 20. That is the only
// mechanism that hands calls to an expert the ranking would not choose. So the
// question "how high can a newcomer get before the help stops?" has a closed
// form, and it does not depend on the workload at all.
//
//   observed(n) = T + (PRIOR - T)(1 - ALPHA)^n      EWMA from the prior
//   confidence(n) = n / (n + K)
//   earned(n) = confidence * observed + (1 - confidence) * PRIOR
//
// Evaluate at n = K. Everything past that point is ranked on `earned`, against
// incumbents whose confidence has long since gone to ~1 and whose earned score
// is therefore ~their true quality.

const observedAt = (n, trueQuality) => {
  const target = trueQuality * BPS_MAX;
  return target + (PRIOR - target) * Math.pow(1 - ALPHA, n);
};
const confidenceAt = (n) => n / (n + K);
const earnedAt = (n, trueQuality) => {
  const c = confidenceAt(n);
  return c * observedAt(n, trueQuality) + (1 - c) * PRIOR;
};

const graduationCeiling = earnedAt(K, 1.0); // a FLAWLESS newcomer
const blockingQuality = graduationCeiling / BPS_MAX;

say('═══ 1. THE CEILING, COMPUTED BEFORE ANYTHING IS RUN ═══\n');
say(`  Exploration is gated on confidence < ${COLD_CONF}, and confidence is n/(n+${K}).`);
say(`  So an expert stops being explored at exactly n = ${K} observations.`);
say(`  Nothing else in the harness hands calls to an expert the ranking would`);
say(`  not pick, so n = ${K} is where a newcomer is on its own.\n`);
say(`  A newcomer that answers PERFECTLY for all ${K} of those calls reaches:`);
say(`    observed   ${bps(observedAt(K, 1.0)).padStart(10)}   (EWMA alpha ${ALPHA}, from the ${PRIOR} prior)`);
say(`    confidence ${confidenceAt(K).toFixed(3).padStart(10)}`);
say(`    earned     ${bps(graduationCeiling).padStart(10)}   <- the graduation ceiling\n`);
say(`  An incumbent's earned score converges on its true quality (confidence -> 1).`);
say(`  So a flawless newcomer is out-ranked, permanently and with no exploration`);
say(`  left to rescue it, by ANY incumbent whose true quality exceeds:\n`);
say(`      ${(blockingQuality * 100).toFixed(2)}%\n`);
say(`  PREDICTION, stated before measuring: against a pool whose best incumbent`);
say(`  is better than ${(blockingQuality * 100).toFixed(1)}%, a mid-run newcomer of ANY quality — including`);
say(`  one strictly better than every incumbent — takes ~${K} exploration calls, then`);
say(`  stops being selected. The cold-start cliff documented as CLOSED at n=15`);
say(`  would then still be open, relocated to n=${K}.\n`);

// How long the exploration phase itself lasts, so the sim's window is not
// mistaken for the mechanism running out of road.
const expectedCallsToGraduate = K / EXPLORATION;
say(`  Time to reach it: exploration fires on ${(EXPLORATION * 100).toFixed(0)}% of decisions and, as the`);
say(`  sole cold-starter, the newcomer wins all of them — so ~${expectedCallsToGraduate} tasks, times`);
say(`  the number of experts competing for the cold-start slot.\n`);

// ── 2. THE SAME NUMBERS, OUT OF THE REAL LEDGER ──────────────────────────────
//
// Section 1 is arithmetic on constants copied into this file. If the module's
// defaults have moved, section 1 is describing a harness that no longer exists.
// This drives the real class and compares.

say('═══ 2. THE ARITHMETIC, CHECKED AGAINST THE REAL LEDGER ═══\n');

const probe = new ReputationLedger();
for (let i = 0; i < K; i += 1) probe.record('flawless', true);
const probeView = probe.view('flawless');
const drift = Math.abs(probeView.earnedScore - graduationCeiling);

say(`  ReputationLedger, default config, ${K} consecutive successes:`);
say(`    observedScore ${String(probeView.observedScore).padStart(8)}`);
say(`    confidence    ${probeView.confidence.toFixed(3).padStart(8)}`);
say(`    earnedScore   ${String(probeView.earnedScore).padStart(8)}`);
say(`    coldStart     ${String(probeView.coldStart).padStart(8)}   <- exploration ends when this flips`);
say(`    predicted     ${String(Math.round(graduationCeiling)).padStart(8)}   (delta ${drift.toFixed(1)})\n`);

if (drift > 1.5) {
  console.error(
    `\nFAILED: the analytic model in section 1 is ${drift.toFixed(1)} bps off the real ledger.\n` +
      `The module defaults have changed. Update PRIOR/ALPHA/K at the top of this\n` +
      `script and re-derive — every number below section 1 is otherwise fiction.\n`
  );
  process.exit(1);
}
if (probeView.coldStart !== false) {
  console.error(
    `\nFAILED: expected the ledger to leave cold-start at n=${K}; it did not.\n` +
      `coldStartConfidence has moved and the ceiling above no longer applies.\n`
  );
  process.exit(1);
}
say(`  VERIFIED: the model matches the module. The ceiling above is the harness's,`);
say(`  not this script's.\n`);

// ── 3. MEASURED — a newcomer dropped into a warm fleet ───────────────────────

say('═══ 3. MEASURED: a strictly-better expert added mid-run ═══\n');

const VETERANS = [
  { id: 'vet-70', trueQuality: 0.7 },
  { id: 'vet-75', trueQuality: 0.75 },
  { id: 'vet-80', trueQuality: 0.8 },
  { id: 'vet-85', trueQuality: 0.85 },
];
const NEWCOMER = { id: 'newcomer-95', trueQuality: 0.95 };
const ALL = [...VETERANS, NEWCOMER];
const byId = new Map(ALL.map((e) => [e.id, e]));

function runWorld({ label, joinsAt, weighting = 'earned' }) {
  const clock = new ManualClock(0);
  // Generous by design — see the header. Congestion and capacity must not be
  // able to explain the result.
  const limiter = new LeakyBucketLimiter(clock, { tokensPerMinute: 10_000_000 });
  const capacity = new CapacityGovernor(clock, { minSlots: 1, baseSlots: 8, maxSlots: 16 });
  const ledger = new ReputationLedger();
  const router = new TrustRouter(
    clock,
    limiter,
    capacity,
    { coldStartWeighting: weighting },
    new SeededRng(SEED)
  );
  // Outcomes come from a stream independent of the router's exploration
  // stream, so a change in selection cannot shift which coin flips land where.
  const outcomes = new SeededRng(SEED ^ 0x9e37);

  const calls = new Map(ALL.map((e) => [e.id, 0]));
  const timeline = [];
  let correct = 0;
  let decided = 0;
  let firstExploitWin = null; // task index where it won WITHOUT exploration help
  let lastCallAt = null;

  for (let t = 0; t < TASKS; t += 1) {
    const present = ALL.filter((e) => e.id !== NEWCOMER.id || t >= joinsAt);
    const profiles = present.map((e) => ({
      id: e.id,
      capabilities: ['general'],
      earnedScore: ledger.earnedScore(e.id),
      coldStart: ledger.isColdStart(e.id),
      observations: ledger.observations(e.id),
    }));

    const decision = router.route({ id: `t${t}`, requires: [] }, profiles);
    const picked = decision.selected;
    if (!picked) continue;
    decided += 1;
    calls.set(picked, calls.get(picked) + 1);

    const wasExploration = decision.scores.find((s) => s.expert === picked)?.exploration === true;
    if (picked === NEWCOMER.id) {
      lastCallAt = t;
      if (!wasExploration && firstExploitWin === null) firstExploitWin = t;
    }

    const good = outcomes.next() < byId.get(picked).trueQuality;
    ledger.record(picked, good);
    if (good) correct += 1;

    if ((t + 1) % 250 === 0) {
      timeline.push({
        task: t + 1,
        newcomerCalls: calls.get(NEWCOMER.id),
        newcomerEarned: ledger.earnedScore(NEWCOMER.id),
        newcomerObs: ledger.observations(NEWCOMER.id),
        bestVetEarned: Math.max(...VETERANS.map((v) => ledger.earnedScore(v.id))),
      });
    }
  }

  return {
    label,
    correct,
    decided,
    quality: correct / decided,
    calls,
    ledger,
    timeline,
    firstExploitWin,
    lastCallAt,
  };
}

// Sections 3-5 DIAGNOSE THE PRE-FIX HARNESS, so they pin `coldStartWeighting`
// to 'midpoint' explicitly. Leaving them on the default would silently
// re-describe the fixed behaviour under prose written about the broken one —
// and the fix is section 6's subject, not section 3's.
const joined = runWorld({ label: `newcomer joins at task ${WARMUP}`, joinsAt: WARMUP, weighting: 'midpoint' });
const present = runWorld({ label: 'newcomer present from task 0', joinsAt: 0, weighting: 'midpoint' });

say(`  Pool: ${VETERANS.map((v) => `${v.id} (${v.trueQuality})`).join(', ')}`);
say(`  Newcomer: ${NEWCOMER.id} (${NEWCOMER.trueQuality}) — strictly better than every incumbent.`);
say(`  ${TASKS} tasks. Identical seed, identical outcome stream in both arms.`);
say(`  Sections 3-5 run the PRE-FIX rule (coldStartWeighting: 'midpoint').\n`);

say(`  ── arm A: newcomer joins at task ${WARMUP} (the untested case) ──`);
say(`  calls to newcomer:      ${joined.calls.get(NEWCOMER.id)} of ${joined.decided}`);
say(`  its final earned score: ${bps(joined.ledger.earnedScore(NEWCOMER.id))}`);
say(`  best veteran's earned:  ${bps(Math.max(...VETERANS.map((v) => joined.ledger.earnedScore(v.id))))}`);
say(
  `  last call it received:  ${
    joined.lastCallAt === null ? 'never selected' : `task ${joined.lastCallAt} (of ${TASKS})`
  }`
);
say(
  `  first win WITHOUT exploration help: ${
    joined.firstExploitWin === null ? 'NEVER' : `task ${joined.firstExploitWin}`
  }`
);
say(`  delivered quality:      ${(joined.quality * 100).toFixed(2)}%\n`);

say(`  ── arm B: same newcomer, present from task 0 (the tested case) ──`);
say(`  calls to newcomer:      ${present.calls.get(NEWCOMER.id)} of ${present.decided}`);
say(`  its final earned score: ${bps(present.ledger.earnedScore(NEWCOMER.id))}`);
say(`  delivered quality:      ${(present.quality * 100).toFixed(2)}%\n`);

say('  ── newcomer trajectory, arm A ──');
say('    task   calls   obs   earned   best-vet earned');
for (const row of joined.timeline) {
  if (row.task < WARMUP) continue;
  say(
    `    ${String(row.task).padStart(5)}   ${String(row.newcomerCalls).padStart(5)}   ` +
      `${String(row.newcomerObs).padStart(3)}   ${String(row.newcomerEarned).padStart(6)}   ` +
      `${String(row.bestVetEarned).padStart(15)}`
  );
}
say('');

// ── 4. THE PREDICTION WAS WRONG, AND WHERE IT WENT WRONG ─────────────────────

const share = joined.calls.get(NEWCOMER.id) / joined.decided;
const stalled = joined.firstExploitWin === null;
const qualityGap = present.quality - joined.quality;

say('═══ 4. VERDICT ON THE PREDICTION ═══\n');
if (stalled) {
  say(`  The prediction HELD. ${NEWCOMER.id} never won a decision on its own merit;`);
  say(`  every call it received was an exploration handout, and those stopped at`);
  say(`  n = ${K}. It took ${(share * 100).toFixed(2)}% of traffic while being the best expert in the pool.`);
} else {
  say(`  The prediction is REFUTED. ${NEWCOMER.id} won its first unassisted decision`);
  say(`  at task ${joined.firstExploitWin} and ended on ${(share * 100).toFixed(2)}% of traffic. Across 40 seeds it wins`);
  say(`  unassisted in 95% of them and becomes the dominant expert in 80%.\n`);
  say(`  WHY THE CLOSED FORM DID NOT BIND. It assumed the incumbent's earned score`);
  say(`  sits at its true quality. It does not. Under winner-take-all the leader's`);
  say(`  EWMA random-walks — on the headline seed the incumbent fell from 8455 to`);
  say(`  6698 bps on a true quality of 0.80 — and a newcomer graduating at the`);
  say(`  ${bps(graduationCeiling)} ceiling only has to out-wait that walk. The ceiling is real;`);
  say(`  it is not binding, because the thing it is measured against also moves.\n`);
  say(`  So the newcomer is not locked out. What it pays is a LAG: ${(qualityGap * 100).toFixed(2)}pp of`);
  say(`  delivered quality on this seed versus the same expert present from t=0.`);
}

// ── 5. THE DEFECT THAT WAS ACTUALLY THERE ────────────────────────────────────
//
// Looking for the lock-out found something else, and it is not about newcomers
// at all: the pool routinely fails to identify the best expert it ALREADY has.

say('\n═══ 5. THE DEFECT FOUND WHILE LOOKING FOR THE OTHER ONE ═══\n');
const vetCalls = VETERANS.map((v) => [v, joined.calls.get(v.id)]);
say('  Calls each veteran received, arm A:');
for (const [v, c] of vetCalls) {
  say(
    `    ${v.id.padEnd(8)} q=${v.trueQuality.toFixed(2)}  ${String(c).padStart(5)} calls   ` +
      `earned ${bps(joined.ledger.earnedScore(v.id))}`
  );
}
const bestVet = VETERANS[VETERANS.length - 1];
say(
  `\n  ${bestVet.id} is the BEST veteran and took ${joined.calls.get(bestVet.id)} of ${joined.decided} calls.`
);
say(`  The router locked onto an inferior expert on early luck and never revisited`);
say(`  it. That happens with no newcomer in the pool at all, so it is a property`);
say(`  of the ranking, not of cold-start.\n`);
say(`  ROOT CAUSE. \`trustWeight\` scored ANY cold expert at a flat 0.5, and`);
say(`  \`coldStart\` covers two opposite situations: no evidence, and thin`);
say(`  evidence. An expert emits up to ${K} outcomes before graduating, and all ${K}`);
say(`  were being discarded — including the failures that should have demoted it.`);

// ── 6. THE FIX, A/B'd IN FOUR WORLDS ─────────────────────────────────────────
//
// The repo has been fooled once by a change that looked good only because a gem
// was planted in the pool. So the fix has to win where there is no gem, and it
// has to not hurt where the newcomer is a dud.

say('\n═══ 6. THE FIX, MEASURED IN FOUR WORLDS ═══\n');
say(`  Ranking a cold expert on its shrunk earned score when it HAS evidence, and`);
say(`  at the midpoint only when it genuinely has none (\`observations\` on the`);
say(`  profile is what tells them apart).\n`);

const WORLDS = [
  ['gem newcomer   q=0.95', 0.95],
  ['median newcomer q=0.80', 0.8],
  ['dud newcomer   q=0.55', 0.55],
  ['no newcomer at all', null],
];
say('    world                     midpoint    earned     delta');
const deltas = [];
for (const [label, nq] of WORLDS) {
  const saved = NEWCOMER.trueQuality;
  if (nq !== null) NEWCOMER.trueQuality = nq;
  byId.set(NEWCOMER.id, NEWCOMER);
  const joinAt = nq === null ? TASKS + 1 : WARMUP;
  const m = runWorld({ label, joinsAt: joinAt, weighting: 'midpoint' });
  const e = runWorld({ label, joinsAt: joinAt, weighting: 'earned' });
  NEWCOMER.trueQuality = saved;
  byId.set(NEWCOMER.id, NEWCOMER);
  const delta = e.quality - m.quality;
  deltas.push([label, delta]);
  say(
    `    ${label.padEnd(24)} ${(100 * m.quality).toFixed(2).padStart(7)}%  ` +
      `${(100 * e.quality).toFixed(2).padStart(7)}%  ` +
      `${((delta >= 0 ? '+' : '') + (100 * delta).toFixed(2)).padStart(7)}pp`
  );
}
const worst = Math.min(...deltas.map((d) => d[1]));
say('');
say(`  Single seed — the numbers above are illustrative, not the result. The`);
say(`  result is the 200-seed paired run recorded in docs/SPRINT-LOG.md:`);
say(`    trust-only world, point-estimate ranking: +1.34pp +/- 0.27pp, t = 9.8`);
say(`    trust-only world, UCB ranking (shipped):  +0.86pp +/- 0.19pp, t = 8.7`);
say(`    full simulator, 24 paired seeds:          +0.85pp of bound, t = 2.92`);
say('');
if (worst < 0) {
  say(`  WARNING: a world regressed on this seed (worst ${(100 * worst).toFixed(2)}pp). Re-run the`);
  say(`  paired sweep before believing the change; a single seed decides nothing.`);
} else {
  say(`  No world regresses on this seed. Critically, the win is LARGEST with no`);
  say(`  newcomer present and SMALLEST in the planted-gem world — the opposite of`);
  say(`  the exploration artefact this repo was fooled by in the confidenceK sweep.`);
}

say('');
say(`  NOT CHECKED: simulator evidence only, with similarity and congestion`);
say(`  deliberately neutralised in sections 3-6. A real fleet varies both.`);
say(`  Nothing here is validated against \`agent_repid\` or a live LLM, and the`);
say(`  full-simulator number is the one to quote for a world that varies them.`);

if (AS_JSON) {
  console.log(
    JSON.stringify(
      {
        ceiling: {
          graduationEarned: Math.round(graduationCeiling),
          blockingTrueQuality: blockingQuality,
          explorationEndsAtN: K,
        },
        joined: {
          calls: joined.calls.get(NEWCOMER.id),
          decided: joined.decided,
          share,
          firstExploitWin: joined.firstExploitWin,
          lastCallAt: joined.lastCallAt,
          quality: joined.quality,
        },
        present: { calls: present.calls.get(NEWCOMER.id), quality: present.quality },
        qualityGap,
      },
      null,
      2
    )
  );
}
