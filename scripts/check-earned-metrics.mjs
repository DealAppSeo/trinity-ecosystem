#!/usr/bin/env node
//
// check-earned-metrics.mjs — assertions for lib/trustshell/EarnedMetrics.ts
//
// The module decides what recorded outcomes mean, and its output gates payment
// authority. The properties worth protecting are not "does it compute a mean"
// but the ones that stop a score being earned dishonestly:
//
//   - absent evidence never pays
//   - stale evidence decays
//   - less evidence never outranks more at the same success rate
//   - a future timestamp cannot buy extra weight
//
// Each of those is asserted below against a fixed `now`, so the suite is
// deterministic rather than drifting with the wall clock.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { localTsc } from './local-tsc.mjs';

const SOURCE = 'lib/trustshell/EarnedMetrics.ts';
const outDir = mkdtempSync(join(tmpdir(), 'trustshell-earned-'));

let M;
try {
  execFileSync(
    localTsc(),
    [SOURCE, '--outDir', outDir, '--module', 'commonjs', '--target', 'es2019'],
    { stdio: 'pipe' }
  );
  M = await import(pathToFileURL(join(outDir, 'EarnedMetrics.js')).href);
} catch (err) {
  console.error(`Could not compile ${SOURCE}:`);
  console.error(String(err.stdout ?? '') + String(err.stderr ?? err.message));
  process.exit(1);
}

const NOW = Date.parse('2026-08-14T00:00:00Z');
const daysAgo = (d) => new Date(NOW - d * 86_400_000).toISOString();
const obs = (d, success, domain) => ({ observedAt: daysAgo(d), success, domain });

let passed = 0;
const check = (name, fn) => {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`FAIL: ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
};

// ---------------------------------------------------------------- empty input

check('empty observation set is unmeasured, not zero', () => {
  const r = M.measureRate([], { now: NOW });
  assert.equal(r.state, 'unmeasured');
  assert.equal(r.value, null, 'value must be null, never a default number');
  assert.equal(r.observations, 0);
  assert.equal(r.confidence, 0);
  assert.equal(r.freshnessDays, null);
});

check('empty latency set is unmeasured', () => {
  const r = M.measureLatencyMs([], { now: NOW });
  assert.equal(r.state, 'unmeasured');
  assert.equal(r.value, null);
});

// -------------------------------------------------------------------- decay

check('a fresh observation carries ~full weight', () => {
  const r = M.measureRate([obs(0, true)], { now: NOW, minEffectiveN: 0 });
  assert.ok(Math.abs(r.effectiveN - 1) < 1e-9, `effectiveN was ${r.effectiveN}`);
});

check('one half-life halves the evidence weight', () => {
  const r = M.measureRate([obs(30, true)], { now: NOW, minEffectiveN: 0, halfLifeDays: 30 });
  assert.ok(Math.abs(r.effectiveN - 0.5) < 1e-9, `effectiveN was ${r.effectiveN}`);
});

check('four half-lives leave a sixteenth', () => {
  const r = M.measureRate([obs(120, true)], { now: NOW, minEffectiveN: 0, halfLifeDays: 30 });
  assert.ok(Math.abs(r.effectiveN - 0.0625) < 1e-9, `effectiveN was ${r.effectiveN}`);
});

check('stale evidence falls below the floor and reports insufficient', () => {
  // 10 successes, all 8 months old: real rows, but nothing recent enough to score.
  const rows = Array.from({ length: 10 }, () => obs(240, true));
  const r = M.measureRate(rows, { now: NOW });
  assert.equal(r.state, 'insufficient');
  assert.equal(r.value, null, 'an insufficient metric must not emit a value');
  assert.equal(r.observations, 10, 'it should still report how many rows it saw');
  assert.ok(r.rawValue !== null, 'rawValue stays available for diagnostics');
  assert.match(r.reason, /below the/);
});

check('freshnessDays reports the newest observation, not the oldest', () => {
  const r = M.measureRate([obs(100, true), obs(2, true), obs(50, true)], { now: NOW });
  assert.ok(Math.abs(r.freshnessDays - 2) < 1e-6, `freshnessDays was ${r.freshnessDays}`);
});

// ---------------------------------------------------------------- shrinkage

check('a single success does not yield a perfect score', () => {
  const r = M.measureRate([obs(0, true)], { now: NOW });
  assert.equal(r.state, 'measured');
  assert.ok(r.value < 0.15, `one observation scored ${r.value}; shrinkage did not apply`);
  assert.equal(r.rawValue, 1, 'raw rate is still 1 — shrinkage is applied on top, not instead');
});

check('abundant fresh evidence approaches the raw rate', () => {
  const rows = Array.from({ length: 500 }, () => obs(0, true));
  const r = M.measureRate(rows, { now: NOW });
  assert.ok(r.value > 0.97, `500 fresh successes scored only ${r.value}`);
  assert.ok(r.confidence > 0.97, `confidence was ${r.confidence}`);
});

check('confidence rises monotonically with evidence', () => {
  const c = (n) => M.measureRate(Array.from({ length: n }, () => obs(0, true)), { now: NOW }).confidence;
  const a = c(1), b = c(10), d = c(100);
  assert.ok(a < b && b < d, `confidence did not increase: ${a}, ${b}, ${d}`);
});

check('shrinkage target is 0, so absent evidence costs rather than pays', () => {
  assert.equal(M.PRIOR_VALUE, 0);
  const r = M.measureRate([obs(0, true), obs(0, true)], { now: NOW });
  assert.ok(r.value < r.rawValue, 'shrinkage must pull the score down, not up');
});

// ------------------------------------------------- the anti-gaming property

check('CORE RULE: less evidence never outranks more at the same success rate', () => {
  const few = M.measureRate(Array.from({ length: 3 }, () => obs(0, true)), { now: NOW });
  const many = M.measureRate(Array.from({ length: 300 }, () => obs(0, true)), { now: NOW });
  assert.ok(
    few.value < many.value,
    `3 perfect observations scored ${few.value} vs ${many.value} for 300 — a thin record must not win`
  );
});

check('a perfect thin record loses to a strong thick one', () => {
  // 5/5 perfect vs 900/1000. The thick record is worse per-observation and must
  // still win, because it has actually demonstrated the behaviour.
  const thin = M.measureRate(Array.from({ length: 5 }, () => obs(0, true)), { now: NOW });
  const thick = M.measureRate(
    Array.from({ length: 1000 }, (_, i) => obs(0, i < 900)),
    { now: NOW }
  );
  assert.ok(thin.value < thick.value, `thin ${thin.value} beat thick ${thick.value}`);
});

check('a future timestamp cannot buy extra weight', () => {
  const future = { observedAt: new Date(NOW + 400 * 86_400_000).toISOString(), success: true };
  const r = M.measureRate([future], { now: NOW, minEffectiveN: 0 });
  assert.ok(r.effectiveN <= 1 + 1e-9, `a future-dated row earned ${r.effectiveN} weight`);
});

check('an unparseable timestamp contributes no weight', () => {
  const r = M.measureRate([{ observedAt: 'not-a-date', success: true }], { now: NOW, minEffectiveN: 0 });
  assert.equal(r.effectiveN, 0);
});

check('failures pull the rate down', () => {
  const good = M.measureRate(Array.from({ length: 100 }, () => obs(0, true)), { now: NOW });
  const mixed = M.measureRate(Array.from({ length: 100 }, (_, i) => obs(0, i % 2 === 0)), { now: NOW });
  assert.ok(mixed.value < good.value);
  assert.ok(Math.abs(mixed.rawValue - 0.5) < 1e-9, `rawValue was ${mixed.rawValue}`);
});

// ------------------------------------------------------------ domain scoping

check('domain scoping counts only that domain', () => {
  const rows = [obs(0, true, 'trading'), obs(0, false, 'peer_verify'), obs(0, true, 'trading')];
  const r = M.measureRate(rows, { now: NOW, domain: 'trading', minEffectiveN: 0 });
  assert.equal(r.observations, 2);
  assert.equal(r.rawValue, 1);
});

check('an empty domain is unmeasured and names the domain', () => {
  const r = M.measureRate([obs(0, true, 'trading')], { now: NOW, domain: 'finance' });
  assert.equal(r.state, 'unmeasured');
  assert.match(r.reason, /finance/);
});

// ---------------------------------------------------------------- latency

check('latency is a decay-weighted mean', () => {
  const r = M.measureLatencyMs(
    [{ observedAt: daysAgo(0), latencyMs: 100 }, { observedAt: daysAgo(0), latencyMs: 300 }],
    { now: NOW }
  );
  assert.equal(r.state, 'measured');
  assert.ok(Math.abs(r.rawValue - 200) < 1e-9, `mean was ${r.rawValue}`);
});

check('recent latency dominates stale latency', () => {
  const r = M.measureLatencyMs(
    [{ observedAt: daysAgo(0), latencyMs: 100 }, { observedAt: daysAgo(300), latencyMs: 5000 }],
    { now: NOW }
  );
  assert.ok(r.rawValue < 150, `stale 5000ms sample still dragged the mean to ${r.rawValue}`);
});

check('negative and non-finite latency samples are discarded', () => {
  const r = M.measureLatencyMs(
    [{ observedAt: daysAgo(0), latencyMs: -5 }, { observedAt: daysAgo(0), latencyMs: NaN }],
    { now: NOW }
  );
  assert.equal(r.state, 'unmeasured');
});

// --------------------------------------------------------- scoring handoff

const setOf = (o) => ({
  bftAccuracy: o.bft ?? M.measureRate([], { now: NOW }),
  veritasCatchRate: o.veritas ?? M.measureRate([], { now: NOW }),
  x402SuccessRate: o.x402 ?? M.measureRate([], { now: NOW }),
  latencyMs: o.latency ?? M.measureLatencyMs([], { now: NOW }),
});

check('unmeasured rates score zero, never a default', () => {
  const inputs = M.toScoringInputs(setOf({}));
  assert.equal(inputs.bftAccuracy, 0);
  assert.equal(inputs.veritasCatchRate, 0);
  assert.equal(inputs.x402SuccessRate, 0);
});

check('unmeasured LATENCY scores worst, not best', () => {
  // The asymmetry that matters: 0ms would be a perfect latency score awarded for
  // having no data at all.
  const inputs = M.toScoringInputs(setOf({}));
  assert.equal(inputs.latencyMs, 2000, 'absent latency must map to the worst point on the curve');
});

check('an insufficient metric scores zero exactly like an unmeasured one', () => {
  const stale = M.measureRate(Array.from({ length: 10 }, () => obs(240, true)), { now: NOW });
  assert.equal(stale.state, 'insufficient');
  assert.equal(M.toScoringInputs(setOf({ bft: stale })).bftAccuracy, 0);
});

check('measured rates are expressed as percentages for the calculator', () => {
  const rows = Array.from({ length: 500 }, () => obs(0, true));
  const inputs = M.toScoringInputs(setOf({ bft: M.measureRate(rows, { now: NOW }) }));
  assert.ok(inputs.bftAccuracy > 97 && inputs.bftAccuracy <= 100, `got ${inputs.bftAccuracy}`);
});

// ---------------------------------------------------------- evidence report

check('describeEvidence separates the three states', () => {
  const rows = Array.from({ length: 200 }, () => obs(0, true));
  const stale = M.measureRate(Array.from({ length: 10 }, () => obs(240, true)), { now: NOW });
  const set = setOf({ bft: M.measureRate(rows, { now: NOW }), veritas: stale });
  const rep = M.describeEvidence(set);
  assert.deepEqual(rep.measured, ['bftAccuracy']);
  assert.deepEqual(rep.insufficient, ['veritasCatchRate']);
  assert.deepEqual(rep.unmeasured.sort(), ['latencyMs', 'x402SuccessRate']);
  assert.equal(rep.fullyMeasured, false);
});

check('fullyMeasured is true only when every metric is measured', () => {
  const rows = Array.from({ length: 200 }, () => obs(0, true));
  const lat = M.measureLatencyMs(
    Array.from({ length: 200 }, () => ({ observedAt: daysAgo(0), latencyMs: 180 })),
    { now: NOW }
  );
  const m = M.measureRate(rows, { now: NOW });
  const rep = M.describeEvidence({
    bftAccuracy: m, veritasCatchRate: m, x402SuccessRate: m, latencyMs: lat,
  });
  assert.equal(rep.fullyMeasured, true);
  assert.equal(rep.insufficient.length, 0);
  assert.equal(rep.unmeasured.length, 0);
});

check('every metric carries a reason string into the report', () => {
  const rep = M.describeEvidence(setOf({}));
  for (const k of ['bftAccuracy', 'veritasCatchRate', 'x402SuccessRate', 'latencyMs']) {
    assert.ok(rep.detail[k].reason.length > 0, `${k} had no reason`);
  }
});

check('weakestConfidence is 0 when nothing is measured', () => {
  assert.equal(M.describeEvidence(setOf({})).weakestConfidence, 0);
});

rmSync(outDir, { recursive: true, force: true });

if (process.exitCode) {
  console.error(`\n${passed} passed, some failed`);
} else {
  console.log(`\n${passed} passed, 0 failed`);
}
