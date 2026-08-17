// scripts/hal-accuracy-test.mjs
//
// Is HAL any good at detecting hallucinations? This suite answers it with a
// number, from a committed corpus, in CI, with no database.
//
// It exists because that question had never been answered here. The index
// carried HAL's OUTAGE (fleet down, Sean-owned) and HAL's SCORING BAND, and no
// entry anywhere stated a precision, a recall or an AUC. The data to compute
// them had been sitting in `hal_runner_results` since May.
//
// THE ASSERTION THAT MATTERS MOST is not the accuracy figure. It is
// `PooledModes`: computing across `hal_mode` reports AUC 0.484 — WORSE THAN
// CHANCE — for a detector that scores 0.958 within `fact-check-s2`. Anyone who
// queries this table without partitioning first will publish that this detector
// is broken. It is not; the corpus is three incomparable score scales stacked.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.hal-accuracy-check-'));
let A;
try {
  execFileSync(
    localTsc(),
    [
      'lib/hal/accuracy.ts',
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
  A = await import(pathToFileURL(join(outDir, 'hal', 'accuracy.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  throw e;
}

let passed = 0;
const failures = [];
async function check(name, fn) {
  try {
    await fn();
    passed++;
  } catch (e) {
    failures.push({ name, message: e.message });
    console.log(`  FAIL  ${name} — ${e.message}`);
  }
}
const eq = (a, b, m) => {
  if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};
const near = (a, b, tol, m) => {
  if (a === null || Math.abs(a - b) > tol)
    throw new Error(`${m}: expected ${b} ±${tol}, got ${a}`);
};
const truthy = (v, m) => {
  if (!v) throw new Error(m);
};
function throws(fn, needle, m) {
  try {
    fn();
  } catch (e) {
    if (!String(e.message).includes(needle))
      throw new Error(`${m}: threw, but not matching "${needle}" — got: ${e.message}`);
    return;
  }
  throw new Error(`${m}: expected a throw, got none`);
}

// ── the corpus ──────────────────────────────────────────────────────────────
const fixture = JSON.parse(
  readFileSync('lib/hal/fixtures/runner-results-2026-08-16.json', 'utf8')
);
const ALL = fixture.rows.map(([mode, score, y, gf, v, thr, src]) => ({
  mode,
  score: Number(score),
  isHallucination: y === 1,
  genFailed: gf === 1,
  vetoed: v === 1,
  threshold: Number(thr),
  // Extra field, ignored by every function in accuracy.ts. Carried so the
  // suite can assert the SUB-stratum split below.
  benchmarkSource: src,
}));

// ── A. the corpus is what we think it is ────────────────────────────────────
// Every real-data retraction here came from an assumption about the SHAPE of a
// sample. These assertions are that check, made mechanical.

await check('the fixture is the exported corpus, unaltered', async () => {
  eq(ALL.length, 1709, 'row count');
  const modes = [...A.partitionByMode(ALL).keys()].sort();
  eq(modes.join(','), 'fact-check-s2,mock,real', 'the three modes');
});

await check('ALL labelled hallucinations live in ONE mode', async () => {
  const byMode = A.partitionByMode(ALL);
  eq(byMode.get('mock').filter((r) => r.isHallucination).length, 0, 'mock has no positives');
  eq(byMode.get('real').filter((r) => r.isHallucination).length, 0, 'real has no positives');
  eq(
    byMode.get('fact-check-s2').filter((r) => r.isHallucination).length,
    233,
    'every positive is in fact-check-s2'
  );
});

await check('the three modes are on incompatible score scales', async () => {
  const byMode = A.partitionByMode(ALL);
  const range = (m) => {
    const s = byMode.get(m).map((r) => r.score);
    return [Math.min(...s), Math.max(...s)];
  };
  const [mockLo, mockHi] = range('mock');
  const [realLo, realHi] = range('real');
  const [fcLo, fcHi] = range('fact-check-s2');
  truthy(mockLo >= 50 && mockHi <= 90, `mock is a 50–90 scale, got ${mockLo}–${mockHi}`);
  truthy(realLo > 0.2 && realHi < 0.5, `real is a narrow 0.26–0.42 band, got ${realLo}–${realHi}`);
  truthy(fcLo === 0 && fcHi === 1, `fact-check-s2 is a 0–1 scale, got ${fcLo}–${fcHi}`);
  // The scales do not even overlap. That is why pooling reorders everything.
  truthy(mockLo > fcHi, 'every mock score outranks every fact-check-s2 score');
});

// ── B. the refusal ──────────────────────────────────────────────────────────

await check('EVERY entry point refuses a pooled corpus', async () => {
  for (const [name, fn] of [
    ['rocAuc', () => A.rocAuc(ALL)],
    ['sweep', () => A.sweep(ALL)],
    ['bestF1', () => A.bestF1(ALL)],
    ['confusionAt', () => A.confusionAt(ALL, 0.5)],
    ['realizedConfusion', () => A.realizedConfusion(ALL)],
    ['headroom', () => A.headroom(ALL)],
  ]) {
    throws(fn, 'refusing to compute an accuracy figure across', `${name} must refuse`);
  }
});

await check('THE REFUSAL IS LOAD-BEARING: pooling really does invert the verdict', async () => {
  // Relabel every row to one mode — exactly what a naive `select ... from
  // hal_runner_results` does — and the module will happily compute. The number
  // it returns is the one that would have been published.
  const pooled = ALL.map((r) => ({ ...r, mode: 'pooled' }));
  const auc = A.rocAuc(pooled);
  truthy(auc < 0.5, `pooled AUC must land below chance, got ${auc}`);
  near(auc, 0.484, 0.001, 'the pooled figure a naive query returns');

  const honest = A.rocAuc(A.partitionByMode(ALL).get('fact-check-s2'));
  truthy(
    honest - auc > 0.4,
    `the same score is worth ${honest} within its own mode — the gap IS the trap`
  );
});

// ── C. undefined is not 0.5, and not zero ───────────────────────────────────

await check('AUC is NULL where a class is absent — never 0.5, never 0', async () => {
  const byMode = A.partitionByMode(ALL);
  eq(A.rocAuc(byMode.get('mock')), null, 'mock has no positives: undefined');
  eq(A.rocAuc(byMode.get('real')), null, 'real has no positives: undefined');
  // Two outcomes would render these as "scored badly" and invite a fix to a
  // detector that was never measured.
  truthy(A.rocAuc(byMode.get('mock')) !== 0.5, 'null must not be chance');
  truthy(A.rocAuc(byMode.get('mock')) !== 0, 'null must not be zero');
});

// ── D. what HAL actually scores ─────────────────────────────────────────────

const FC = A.usable(A.partitionByMode(ALL).get('fact-check-s2'));

await check('gen_failed rows are excluded — a provider outage is not a miss', async () => {
  eq(A.partitionByMode(ALL).get('fact-check-s2').length, 464, 'rows in mode');
  eq(FC.length, 395, 'usable rows after dropping 69 failed generations');
  eq(FC.filter((r) => r.isHallucination).length, 197, 'positives');
  eq(FC.filter((r) => !r.isHallucination).length, 198, 'negatives — near balanced');
});

await check('MEASURED: HAL separates hallucinations from clean answers', async () => {
  const auc = A.rocAuc(FC);
  near(auc, 0.9579, 0.0005, 'AUC on fact-check-s2');
  truthy(auc > 0.95, 'this is a strong detector, not a coin flip');
});

await check('TIES GET HALF CREDIT — a SQL rank() AUC is not this number', async () => {
  // Postgres `rank()` assigns MIN rank to ties. Fed to the Mann-Whitney formula
  // that under-reports AUC — it produced 0.8351 for this exact corpus, against
  // a true 0.9579, because many scores sit on 0.0 and 1.0. Pinned so nobody
  // "corrects" the module back to the SQL figure.
  const tied = [
    { mode: 't', score: 1, isHallucination: true, genFailed: false, vetoed: false, threshold: 0 },
    { mode: 't', score: 1, isHallucination: false, genFailed: false, vetoed: false, threshold: 0 },
  ];
  eq(A.rocAuc(tied), 0.5, 'a single tied pair is exactly half credit');
  const distinct = A.rocAuc(FC);
  truthy(distinct > 0.9, `min-rank would report ~0.835 here; tie-aware reports ${distinct}`);
});

await check('THE CEILING: the best F1 any threshold on this score can reach', async () => {
  const best = A.bestF1(FC);
  near(best.threshold, 0.255438, 0.000001, 'optimal threshold');
  near(best.f1, 0.890547, 0.000001, 'ceiling F1');
  eq(best.tp, 179, 'tp at the ceiling');
  eq(best.fp, 26, 'fp at the ceiling');
  eq(best.fn, 18, 'fn at the ceiling');
});

await check("REALIZED: what HAL's own veto decision achieves", async () => {
  // CAVEAT (#65 §5.5, LESSONS A23). 41 of the vetoes inside this figure fired on
  // rows where HAL called NO provider: 19 on hallucinations, 22 on clean answers
  // — slightly MORE often on the clean ones, which is what AUC 0.5150 on that
  // group predicts. They are vetoes HAL genuinely cast, so this remains an
  // accurate description of its realized behaviour and the numbers below stand.
  // What is not evidence-backed is the recall they buy: 0.807 -> 0.904 over the
  // pure cut. Excluding them, realized F1 is the pure cut's 0.8760 — 98.37% of
  // the bound rather than 98.95%. The threshold conclusion is unchanged either
  // way, which is why this is a caveat on the meaning and not a correction.
  const r = A.realizedConfusion(FC);
  eq(r.tp, 178, 'tp');
  eq(r.fp, 29, 'fp');
  eq(r.fn, 19, 'fn');
  eq(r.tn, 169, 'tn');
  near(r.f1, 0.881188, 0.000001, 'realized F1');
  near(r.recall, 0.9036, 0.0001, 'realized recall');
});

await check('0.9579 IS A BLEND — the sub-strata disagree, so never quote it flat', async () => {
  // Found by a sibling lane re-deriving this measurement independently, and
  // confirmed here against the same rows. Partitioning by mode was necessary
  // but NOT sufficient: inside `fact-check-s2` the two benchmark sources are
  // themselves heterogeneous, and one of them is barely above chance.
  const bySource = new Map();
  for (const r of FC) {
    const list = bySource.get(r.benchmarkSource);
    if (list) list.push(r);
    else bySource.set(r.benchmarkSource, [r]);
  }
  eq([...bySource.keys()].sort().join(','), 'hal_test_cases,t12-overnight-2026-06', 'the two sources');

  const weak = bySource.get('hal_test_cases');
  const strong = bySource.get('t12-overnight-2026-06');
  eq(weak.length, 71, 'weak stratum size');
  eq(strong.length, 324, 'strong stratum size');
  near(A.rocAuc(weak), 0.594, 0.001, 'hal_test_cases AUC — barely above chance');
  near(A.rocAuc(strong), 0.9757, 0.0001, 't12-overnight AUC');

  // 82% of the usable corpus is the strong stratum, so the headline number is
  // mostly a property of ONE benchmark source. That is a composition fact, not
  // a detector fact.
  truthy(strong.length / FC.length > 0.8, 'the blend is dominated by one source');
  truthy(
    A.rocAuc(strong) - A.rocAuc(weak) > 0.35,
    'the gap between sources is larger than most effects anyone would tune for'
  );

  // EXPLAINED 2026-08-16 — supersedes the "NOT EXPLAINED" this assertion
  // originally carried (#65, docs/HAL-AUC-STRATIFICATION-2026-08-16.md §5,
  // LESSONS A23). `benchmark_source` was a PROXY. In 59 of these 71 weak-stratum
  // rows `hal_providers_used` is EMPTY — HAL called no verification provider and
  // wrote a hal_score anyway (947ms mean latency against ~3,100ms when one runs).
  // Split on EXECUTION rather than on source and the gap dissolves: AUC 0.9746
  // [0.9574, 0.9917] wherever HAL actually ran, 0.5150 [0.3662, 0.6637] where it
  // did not — the same either side of the benchmark boundary.
  // This fixture cannot check that. The next assertion pins why.

  // And the failed generations are not spread evenly either: every one of them
  // is in the weak stratum, so "drop gen_failed" silently reweights the blend.
  const allFc = A.partitionByMode(ALL).get('fact-check-s2');
  eq(allFc.filter((r) => r.genFailed && r.benchmarkSource === 'hal_test_cases').length, 69, 'all 69');
  eq(
    allFc.filter((r) => r.genFailed && r.benchmarkSource === 't12-overnight-2026-06').length,
    0,
    'none in the strong stratum'
  );
});

await check('this fixture CANNOT audit its own denominator — pinned so it FIRES', async () => {
  // The defect explained above is invisible here by construction: the export
  // omits `hal_providers_used`, the one column that separates a verdict HAL
  // earned from one it emitted having consulted nothing. Every figure in this
  // suite is therefore computed over a denominator it cannot audit.
  //
  // A comment saying so is another unpaid caveat, and this repo has been bitten
  // by those. So the LIMITATION is pinned instead of described: re-export the
  // fixture with the provider column and this assertion FAILS by design. That is
  // the point — it forces whoever re-exports to add the execution assertions
  // (0.9746 where HAL ran, 0.5150 where it did not, and the 41 unearned vetoes)
  // rather than silently inheriting a blended figure that now looks auditable.
  truthy(
    Array.isArray(fixture._schema) && !fixture._schema.includes('hal_providers_used'),
    'fixture gained hal_providers_used — assert the execution split (#65 §5.5, ' +
      'LESSONS A23) and then delete this guard'
  );
});

await check('THE HEADROOM IS 1% — tuning the threshold is NOT where the win is', async () => {
  const h = A.headroom(FC);
  near(h.fractionOfCeiling, 0.989491, 0.000001, 'fraction of the achievable ceiling');
  near(h.absoluteGain, 0.009359, 0.000001, 'absolute F1 available from any re-cut');
  truthy(
    h.fractionOfCeiling > 0.98,
    'HAL is within 2% of the bound; the standing rule is to measure the bound BEFORE ' +
      'spending a sprint on the thing it bounds'
  );
});

await check("HAL's veto is NOT a pure threshold — extra paths fire below it", async () => {
  const live = [...new Set(FC.map((r) => r.threshold))];
  eq(live.length, 1, 'one live threshold across the corpus');
  eq(live[0], 0.43, 'the live threshold');
  const below = FC.filter((r) => r.vetoed && r.score < 0.43).length;
  const aboveUnvetoed = FC.filter((r) => !r.vetoed && r.score >= 0.43).length;
  eq(below, 41, 'rows vetoed BELOW the threshold by other signals');
  eq(aboveUnvetoed, 0, 'the threshold is a hard floor: nothing above it escapes');
  // So the realized number is NOT confusionAt(0.43). Asserting the difference
  // stops anyone modelling HAL as a single cut.
  const pure = A.confusionAt(FC, 0.43);
  near(pure.f1, 0.876033, 0.000001, 'a pure 0.43 cut');
  truthy(
    A.realizedConfusion(FC).f1 > pure.f1,
    'the extra veto paths beat the pure cut — they trade precision for recall and win'
  );
});

await check('bestF1 breaks ties toward the STRICTER threshold', async () => {
  const rows = [
    { mode: 'x', score: 0.1, isHallucination: false, genFailed: false, vetoed: false, threshold: 0 },
    { mode: 'x', score: 0.6, isHallucination: true, genFailed: false, vetoed: false, threshold: 0 },
    { mode: 'x', score: 0.9, isHallucination: true, genFailed: false, vetoed: false, threshold: 0 },
  ];
  // 0.6 and 0.2-ish both reach F1 1.0 and 0.8; the higher cut must win ties.
  const best = A.bestF1(rows);
  eq(best.threshold, 0.6, 'among equal-F1 cuts, prefer the one that vetoes less');
});

rmSync(outDir, { recursive: true, force: true });

console.log(`\nhal-accuracy: ${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  console.log('FAILED — HAL accuracy is not what the corpus says.\n');
  process.exit(1);
}
console.log('All hal-accuracy checks passed.\n');
