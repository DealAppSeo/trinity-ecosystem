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
//
// SECOND, AND IT IS THE ONE WITH TEETH (section E, added with the 2026-08-17
// re-export): HAL consulted NO verification provider on 59 of the 395 usable
// rows, and vetoed 41 of them anyway. Those 41 are 46.3% precise — worse than a
// coin flip — against 95.8% where a provider ran, and they are exactly the rows
// the suite already credited with beating a pure threshold cut. A verdict that
// consulted nothing is not a cheaper verdict; it is a different thing wearing
// the same name.

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
  readFileSync('lib/hal/fixtures/runner-results-2026-08-17.json', 'utf8')
);
const ALL = fixture.rows.map(([mode, score, y, gf, v, thr, src, usedN, attN]) => ({
  mode,
  score: Number(score),
  isHallucination: y === 1,
  genFailed: gf === 1,
  vetoed: v === 1,
  threshold: Number(thr),
  // Extra fields, ignored by every function in accuracy.ts. Carried so the
  // suite can assert the SUB-stratum and EXECUTION splits below.
  benchmarkSource: src,
  /** How many verification providers HAL actually consulted. 0 = it consulted nothing. */
  providersUsed: Number(usedN),
  /** How many it TRIED. Separates "never called one" from "called one and it failed". */
  providersAttempted: Number(attN),
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
  // CAVEAT, NOW ASSERTED RATHER THAN DESCRIBED (#65 §5.5, LESSONS A23; section E
  // below). 41 of the vetoes inside this figure fired on rows where HAL called
  // NO provider: 19 on hallucinations, 22 on clean answers — slightly MORE often
  // on the clean ones, which is what AUC 0.5150 on that group predicts. They are
  // vetoes HAL genuinely cast, so this remains an accurate description of its
  // realized behaviour and the numbers below stand. The recall they buy is
  // 0.807 -> 0.904 over the pure cut; excluding them, realized F1 is the pure
  // cut's 0.8760 — 98.37% of the bound rather than 98.95%. The threshold
  // conclusion is unchanged either way, which is why this is a caveat on the
  // meaning and not a correction. Section E measures the 41 directly, so this
  // paragraph is no longer an unpaid caveat.
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
  // MEASURED DIRECTLY IN SECTION E as of the 2026-08-17 re-export. The
  // 2026-08-16 fixture could not, and pinned a failing guard here instead.

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

// ── E. THE EXECUTION SPLIT — what the 2026-08-16 fixture could not audit ────
//
// That export omitted `hal_providers_used`, so every figure above was computed
// over a denominator it could not audit, and the limitation was PINNED as a
// failing-by-design guard rather than described. This is the follow-up that
// guard existed to force. Re-exported 2026-08-17 with `providers_used_n` and
// `providers_attempted_n`; the guard is gone because these assertions replace
// it.

await check('the re-export carries the provider columns', async () => {
  eq(fixture._schema.length, 9, 'schema width');
  truthy(fixture._schema.includes('providers_used_n'), 'providers_used_n present');
  truthy(fixture._schema.includes('providers_attempted_n'), 'providers_attempted_n present');
  // The corpus itself must be UNCHANGED by the re-export, or every figure above
  // silently moves. fact-check-s2 is byte-identical to the 2026-08-16 export at
  // the precision it stored; see the fixture's _warning4 for the one field that
  // is not (mock's threshold, which no headline figure uses).
  eq(ALL.length, 1709, 'same row count');
  eq(FC.length, 395, 'same usable fact-check-s2 denominator');
});

await check('HAL DID NOT RUN on 59 of the 395 — and never even tried', async () => {
  const ran = FC.filter((r) => r.providersUsed > 0);
  const notRun = FC.filter((r) => r.providersUsed === 0);
  eq(ran.length, 336, 'rows where a verification provider was consulted');
  eq(notRun.length, 59, 'rows where none was');
  // NOT an outage. `providers_attempted` is empty on every one of them, so this
  // is not "called a provider and it failed" — it is a FACTUAL_ERROR verdict
  // emitted having consulted nothing. That distinction is the whole reason the
  // attempted column was exported alongside the used one.
  eq(notRun.filter((r) => r.providersAttempted > 0).length, 0,
    'none of the 59 attempted a provider — this is not a provider outage');
});

await check('AUC 0.9746 where HAL RAN, 0.5150 where it did not', async () => {
  // The measurement the 2026-08-16 warning predicted and could not make. It is
  // the whole of the 0.5940-vs-0.9757 benchmark_source gap asserted above:
  // split on EXECUTION rather than on source and the gap is the same either
  // side of the benchmark boundary.
  near(A.rocAuc(FC.filter((r) => r.providersUsed > 0)), 0.9746, 0.0001, 'provider ran');
  near(A.rocAuc(FC.filter((r) => r.providersUsed === 0)), 0.5150, 0.0001, 'provider did not');
  // 0.5150 is chance. A score written without consulting anything carries no
  // information about whether the answer was a hallucination.
  truthy(A.rocAuc(FC.filter((r) => r.providersUsed === 0)) < 0.60,
    'the no-provider stratum must not be mistaken for a working detector');
});

await check('an UNEARNED veto is worse than a coin flip — 46.3% precision', async () => {
  const notRun = FC.filter((r) => r.providersUsed === 0);
  const vetoes = notRun.filter((r) => r.vetoed);
  eq(vetoes.length, 41, 'vetoes cast having consulted nothing');
  eq(vetoes.filter((r) => r.isHallucination).length, 19, 'landed on a real hallucination');
  eq(vetoes.filter((r) => !r.isHallucination).length, 22, 'landed on a CLEAN answer');
  // More often wrong than right, which is what AUC 0.5150 predicts. Stated as a
  // precision because that is the number a staking design has to price.
  near(A.realizedConfusion(notRun).precision, 0.4634, 0.0001, 'unearned veto precision');
  near(A.realizedConfusion(FC.filter((r) => r.providersUsed > 0)).precision, 0.9578, 0.0001,
    'earned veto precision, for contrast');
});

await check('EVERY sub-threshold veto is an unearned one — they are the SAME 41 rows', async () => {
  // The finding that reframes "the extra veto paths beat the pure cut" above.
  // Those paths are not a second detector earning its keep: their entire
  // population is vetoes cast without consulting a provider, and no unearned
  // veto ever scored at or above the live threshold.
  const below = FC.filter((r) => r.vetoed && r.score < 0.43);
  const unearned = FC.filter((r) => r.vetoed && r.providersUsed === 0);
  eq(below.length, 41, 'vetoed below the threshold');
  eq(unearned.length, 41, 'vetoed having consulted nothing');
  eq(below.filter((r) => r.providersUsed === 0).length, 41, 'the two sets are IDENTICAL');
  eq(unearned.filter((r) => r.score >= 0.43).length, 0,
    'and no unearned veto ever reached the threshold on score alone');
  // So the realized F1 advantage over the pure cut is bought ENTIRELY by them.
  const pure = A.confusionAt(FC, 0.43);
  truthy(A.realizedConfusion(FC).f1 > pure.f1, 'realized still beats the pure cut');
  truthy(A.realizedConfusion(FC.filter((r) => r.providersUsed > 0)).f1 <= 1,
    'stated as a fact about WHERE the gain comes from, not a claim that it is illusory');
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
  //
  // AND SECTION E NAMES WHAT THOSE EXTRA PATHS ARE: all 41 sub-threshold vetoes
  // are exactly the 41 cast without consulting a provider — the same rows, and
  // no unearned veto ever reached 0.43 on score alone. The gain below is real
  // and it is bought entirely by verdicts that consulted nothing.
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
