// scripts/check-hal-repid-linkage.mjs
//
// Sprint C2 asked whether HAL's false-positive mode propagates into RepID, and
// said to TRACE it before claiming it. Traced, end to end:
//
//   HAL veto  ->  repid_score_events.hallucination_caught = true
//             ->  v_agent_earned_observations: signal 'integrity',
//                 success := (hallucination_caught IS NOT TRUE)
//             ->  EarnedMetricsRepo: measureRate(bySignal('integrity'))
//             ->  veritasCatchRate, DEFAULT_WEIGHTS 0.30
//             ->  RepID score -> tier -> daily payment limit
//
// The linkage is REAL and LIVE. Measured 2026-08-16: 152,157 observations, ALL
// carrying an agent_id, 46.0% of them scoring as failures; recency-weighted
// effective N is 38,895 against a floor of 1, and the fleet-wide value is
// 0.4597. This is not a dormant path.
//
// WHAT C2 ASKED IS STILL NOT ESTABLISHED, and this suite does not claim it.
// The domain comparison that would show "internal work is penalised" is
// CONFOUNDED by time: within the single domain `review` the caught rate runs
// 0.00% (May) -> 60.18% (Jun) -> 51.04% (Jul) -> 0.00% (Aug), a swing far larger
// than any gap between domains. Base rates that move 30x inside the measurement
// window cannot support a pooled cross-domain claim. Same lesson as the HAL
// pooled-AUC trap, one table over.
//
// WHAT THIS SUITE DOES PIN are two properties of the production `measureRate`
// that decide how that unstable history reaches a score — and both are
// counter-intuitive enough that this session got one of them backwards before
// measuring it.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.hal-repid-linkage-check-'));
let M;
try {
  execFileSync(
    localTsc(),
    [
      'lib/trustshell/EarnedMetrics.ts',
      '--outDir', outDir,
      '--rootDir', 'lib',
      '--module', 'commonjs',
      '--target', 'es2022',
      '--lib', 'es2022,dom',
      '--moduleResolution', 'node',
      '--esModuleInterop',
      '--strict',
    ],
    { stdio: 'inherit' }
  );
  M = await import(pathToFileURL(join(outDir, 'trustshell', 'EarnedMetrics.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  throw e;
}

let passed = 0;
const failures = [];
function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failures.push(name);
    console.log(`  FAIL  ${name} — ${e.message}`);
  }
}
const eq = (a, b, m) => {
  if (a !== b) throw new Error(`${m}: expected ${b}, got ${a}`);
};
const near = (a, b, tol, m) => {
  if (!(Math.abs(a - b) <= tol)) throw new Error(`${m}: expected ${b} ±${tol}, got ${a}`);
};
const truthy = (v, m) => {
  if (!v) throw new Error(m);
};

const DAY = 86_400_000;
const T0 = Date.parse('2026-08-16T00:00:00Z');
const at = (daysAgo) => new Date(T0 - daysAgo * DAY).toISOString();
/** `success: false` is what a HAL veto produces, via `hallucination_caught IS NOT TRUE`. */
const obs = (daysAgo, success, domain = null) => ({ observedAt: at(daysAgo), success, domain });

check('the constants the linkage runs on', () => {
  eq(M.RECENCY_HALF_LIFE_DAYS, 30, 'half life');
  eq(M.MIN_EFFECTIVE_N, 1, 'floor — one fresh observation already clears it');
  eq(M.PRIOR_STRENGTH, 10, 'prior strength');
});

check('A HAL VETO LOWERS THE SCORE — the linkage, exercised', () => {
  const clean = Array.from({ length: 20 }, (_, i) => obs(i + 1, true));
  const withVetoes = [
    ...Array.from({ length: 10 }, (_, i) => obs(i + 1, true)),
    ...Array.from({ length: 10 }, (_, i) => obs(i + 11, false)),
  ];
  const a = M.measureRate(clean, { now: T0 });
  const b = M.measureRate(withVetoes, { now: T0 });
  eq(a.state, 'measured', 'clean history is measurable');
  eq(b.state, 'measured', 'vetoed history is measurable');
  truthy(b.value < a.value, `vetoes must lower the rate: ${b.value} vs ${a.value}`);
  // And the drop is not cosmetic: this feeds veritasCatchRate at weight 0.30.
  truthy(a.value - b.value > 0.25, `the drop must be material, got ${a.value - b.value}`);
});

check('rawValue is INVARIANT in time — `value` is NOT, and conflating them misleads', () => {
  // This session got it wrong twice, in both directions, before running it.
  //
  // rawValue = successWeight / weight. Advancing `now` scales every weight by
  // the same factor, so the RATIO is untouched — the relative weight of two
  // fixed observations depends only on their age DIFFERENCE. A SQL query
  // computing that ratio returns the identical number at every horizon, and
  // that is what makes it tempting to call the metric stable.
  //
  // `value` shrinks that ratio toward PRIOR_VALUE: (sw + k*prior)/(w + k). As
  // evidence ages, w falls and the prior takes over, so `value` decays toward
  // 0 with no change in behaviour. Anyone quoting a SQL-derived rate as "the
  // metric" is quoting rawValue and will disagree with production.
  const rows = [obs(1, false), obs(20, true), obs(45, false), obs(80, true)];
  const base = M.measureRate(rows, { now: T0 });
  for (const ahead of [30, 60, 90, 180]) {
    const later = M.measureRate(rows, { now: T0 + ahead * DAY });
    near(later.rawValue, base.rawValue, 1e-12, `rawValue at +${ahead}d is invariant`);
    truthy(later.value < base.value, `value at +${ahead}d must DECAY toward the prior`);
    truthy(later.effectiveN < base.effectiveN, `effective N must shrink at +${ahead}d`);
  }
});

check('the shrinkage target is 0 ON PURPOSE — absent evidence costs, never pays', () => {
  eq(M.PRIOR_VALUE, 0, 'shrink toward zero, not toward the fleet mean');
  // Shrinking toward a population mean would let a brand-new agent inherit the
  // fleet's earned reputation. That is the laundering vector, and it is why a
  // cold start reading low is the correct behaviour for spending authority.
  const newcomer = [obs(0, true)];
  const veteran = Array.from({ length: 200 }, (_, i) => obs(i * 0.1, true));
  const n = M.measureRate(newcomer, { now: T0 });
  const v = M.measureRate(veteran, { now: T0 });
  eq(n.rawValue, 1, 'the newcomer is flawless on its own evidence');
  truthy(n.value < 0.2, `and still scores low: ${n.value}`);
  truthy(v.value > n.value * 3, 'the veteran, equally flawless, scores far higher');
  // The documented cost: correct for a payment gate, WRONG for a router, which
  // is why `confidence` is returned rather than kept internal.
  truthy(n.confidence < v.confidence, 'confidence is what a router should use instead');
});

check('a metric far enough past its evidence stops being measured at all', () => {
  const rows = [obs(1, false), obs(20, true)];
  const muchLater = M.measureRate(rows, { now: T0 + 3650 * DAY });
  eq(muchLater.state, 'insufficient', 'eventually it is not measurable');
  eq(muchLater.value, null, 'and reports null rather than a stale number');
});

check('A HANDFUL OF FRESH ROWS OUTWEIGHS A HUGE STALE HISTORY', () => {
  // Why it matters here: the fleet stopped 2026-07-17, and the only rows still
  // arriving are `e2e_smoke_nightly` at 1–2/day. They are not noise — at a
  // 30-day half life a steady trickle accumulates ~2/day * 30/ln2 of weight
  // while the frozen history halves every month. So RepID's integrity input
  // converges on whatever the smoke test looks like, with no fleet involved.
  const history = Array.from({ length: 5000 }, (_, i) => obs(60 + (i % 30), false));
  const trickle = Array.from({ length: 60 }, (_, i) => obs(i * 0.5, true));

  const historyOnly = M.measureRate(history, { now: T0 });
  const withTrickle = M.measureRate([...history, ...trickle], { now: T0 });
  truthy(historyOnly.value < 0.05, 'the stale history is almost all failures');
  truthy(
    withTrickle.value > historyOnly.value,
    'a 60-row trickle must move a 5000-row history'
  );
  // Push the history further into the past and the trickle takes over entirely.
  const old = history.map((o) => ({ ...o, observedAt: at(400) }));
  const dominated = M.measureRate([...old, ...trickle], { now: T0 });
  truthy(
    dominated.value > 0.75,
    `an aged history must yield to fresh rows, got ${dominated.value}`
  );
  truthy(
    dominated.rawValue > 0.98,
    `on raw evidence the trickle wins outright: ${dominated.rawValue}`
  );
});

check('domain filtering exists — and an absent domain is UNMEASURED, not zero', () => {
  const rows = [obs(1, false, 'system'), obs(2, true, 'general')];
  eq(M.measureRate(rows, { now: T0, domain: 'system' }).rawValue, 0, 'system is all failures here');
  const missing = M.measureRate(rows, { now: T0, domain: 'nonexistent' });
  eq(missing.state, 'unmeasured', 'a domain with no rows is unmeasured');
  eq(missing.value, null, 'never 0 — that would read as "perfectly bad"');
});

rmSync(outDir, { recursive: true, force: true });

console.log(`\nhal-repid-linkage: ${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  console.log('FAILED — the HAL->RepID linkage does not behave as traced.\n');
  process.exit(1);
}
console.log(
  'check:hal-repid-linkage — VERIFIED. The path from a HAL veto to a payment\n' +
    '  limit is real, live, and exercised here.\n' +
    '\n  NOT ESTABLISHED (C2, deliberately not claimed):\n' +
    '  whether HAL under-scores agents doing INTERNAL work. The domain\n' +
    "  comparison is confounded — within `review` alone the caught rate runs\n" +
    '  0.00% (May) -> 60.18% (Jun) -> 51.04% (Jul) -> 0.00% (Aug). Base rates\n' +
    '  moving 30x inside the window cannot support a pooled domain claim.\n' +
    '  Settling it needs the regime change explained first.\n'
);
