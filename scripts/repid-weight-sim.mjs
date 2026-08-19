#!/usr/bin/env node
// scripts/repid-weight-sim.mjs — the tuning instrument for RepID weights.
//
// Run:  node scripts/repid-weight-sim.mjs
//       node scripts/repid-weight-sim.mjs --production-bft
//       node scripts/repid-weight-sim.mjs --weights '{"bftAccuracy":0,...}'
//       node scripts/repid-weight-sim.mjs --compare '{"bftAccuracy":0,...}'
//
// This is NOT a check suite. It is the thing you tune WITH: it scores a weight
// vector against the same five populations `check:repid-calibration` uses, via
// the same production module, and reduces the result to ONE number so that
// "did that change help?" has an answer.
//
// ── THE NUMBER, AND WHY IT IS THIS ONE ──────────────────────────────────────
//
// `discrimination` = the smallest gap between adjacent population medians, over
// the ordering cold < barely < weak < typical < strong. If the ordering breaks
// anywhere, it is 0 — a ladder that puts a weak fleet above a typical one is
// not "slightly worse", it is not a ladder.
//
// Minimum-gap rather than mean-gap on purpose: a ladder is only as good as its
// worst rung, and averaging lets a huge strong/typical gap hide a collapsed
// weak/typical one. Tuning toward a mean would optimise the part that already
// works.
//
// STOPPING RULE. Tune until `discrimination` stops rising. It is bounded above
// by the score range, so it cannot be improved indefinitely; when a change
// moves it by less than the run-to-run noise (re-run with --seed to measure
// that), the tuning is done. That is the "until tuning fails to improve"
// criterion, made numeric.
//
// ── --production-bft, WHICH IS THE POINT ────────────────────────────────────
//
// The populations below supply `bftAccuracy` — 0.92 for a strong fleet, 0.45
// for a weak one — and it is one of the strongest separators in the simulation.
//
// PRODUCTION HAS NO SUCH INPUT. Measured 2026-08-17: `v_agent_earned_observations`
// carries zero rows with `signal='bft'`, `bft_payment_evaluations` and
// `prediction_consensus` are both empty, and `EarnedMetricsRepo` therefore
// returns `unmeasured` for `bftAccuracy` on every agent, which scores 0.
//
// So the simulation and production disagree about a term carrying 0.40 of the
// score. `--production-bft` forces that input to 0 for every population, which
// is what the live path actually computes. Comparing the two answers the only
// question that matters before touching a weight: **is the ladder we validate
// the ladder we run?**

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};

const PRODUCTION_BFT = flag('--production-bft');
const SEED = Number(value('--seed') ?? 20260816);

// ─────────────────────────────────────────────── compile the production module
const outDir = mkdtempSync(join(process.cwd(), '.repid-weight-sim-'));
let m;
try {
  execFileSync(
    localTsc(),
    ['lib/trustshell/repid-scoring.ts', '--outDir', outDir, '--rootDir', 'lib',
      '--module', 'commonjs', '--target', 'es2022', '--lib', 'es2022,dom',
      '--moduleResolution', 'node', '--esModuleInterop', '--strict'],
    { stdio: 'pipe' }
  );
  m = await import(pathToFileURL(join(outDir, 'trustshell', 'repid-scoring.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('repid-weight-sim: compilation failed\n');
  console.error(e.stdout?.toString() || e.message);
  process.exit(2); // NOT_CHECKED — could not run, which is not a pass
}
const {
  DEFAULT_WEIGHTS, normalizeMetrics, contributionsOf, sumContributions,
  scoreFromWeightedSum, tierForScore, weightsProblem,
} = m;

// ───────────────────────────────────────────────────────── populations (as in
// check:repid-calibration, deliberately identical so the two agree)
const POPULATIONS = {
  cold:    { bft: 0.00, veritas: 0.00, x402: 0.00, latencyMs: 2000, custody: 0.00, spread: 0 },
  barely:  { bft: 0.04, veritas: 0.04, x402: 0.03, latencyMs: 1950, custody: 0.00 },
  weak:    { bft: 0.45, veritas: 0.30, x402: 0.70, latencyMs: 1500, custody: 0.10 },
  typical: { bft: 0.75, veritas: 0.60, x402: 0.90, latencyMs: 700,  custody: 0.50 },
  strong:  { bft: 0.92, veritas: 0.85, x402: 0.97, latencyMs: 250,  custody: 1.00 },
};
const ORDER = ['cold', 'barely', 'weak', 'typical', 'strong'];
const N = 4000;

function simulate(p, weights) {
  let seed = SEED;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const around = (mean, spread) => clamp01(mean + (rand() + rand() + rand() - 1.5) * spread);

  const scores = [];
  const bands = { Bronze: 0, Silver: 0, Gold: 0, Platinum: 0 };
  for (let i = 0; i < N; i += 1) {
    const raw = {
      // PRODUCTION_BFT: the live path has no bft observations, so it scores 0.
      bftAccuracy: PRODUCTION_BFT ? 0 : around(p.bft, p.spread ?? 0.15) * 100,
      veritasCatchRate: around(p.veritas, p.spread ?? 0.15) * 100,
      x402SuccessRate: around(p.x402, p.spread ?? 0.10) * 100,
      latencyMs: p.latencyMs * (p.spread === 0 ? 1 : 0.6 + rand() * 0.8),
      humanCustody: rand() < p.custody,
    };
    const s = scoreFromWeightedSum(sumContributions(contributionsOf(normalizeMetrics(raw), weights)));
    scores.push(s);
    bands[tierForScore(s)] += 1;
  }
  scores.sort((a, b) => a - b);
  return { bands, median: scores[Math.floor(scores.length / 2)] };
}

function evaluate(weights) {
  const sim = Object.fromEntries(ORDER.map((k) => [k, simulate(POPULATIONS[k], weights)]));
  let monotone = true;
  let minGap = Infinity;
  for (let i = 1; i < ORDER.length; i += 1) {
    const gap = sim[ORDER[i]].median - sim[ORDER[i - 1]].median;
    if (gap <= 0) monotone = false;
    minGap = Math.min(minGap, gap);
  }
  return { sim, monotone, discrimination: monotone ? minGap : 0 };
}

function render(label, weights, r) {
  console.log(`\n── ${label} ─────────────────────────────────────────`);
  console.log(`   weights  ${Object.entries(weights).map(([k, v]) => `${k.replace(/[a-z]/g, '')}=${v}`).join('  ')}`);
  for (const k of ORDER) {
    const s = r.sim[k];
    const top = Object.entries(s.bands).sort((a, b) => b[1] - a[1])[0][0];
    console.log(
      `   ${k.padEnd(8)} median ${String(s.median).padStart(5)}   modal ${top.padEnd(8)}` +
        `  B/S/G/P ${['Bronze', 'Silver', 'Gold', 'Platinum'].map((b) => ((100 * s.bands[b]) / N).toFixed(0).padStart(3)).join('/')}`
    );
  }
  console.log(
    `   ORDERING ${r.monotone ? 'monotone ✓' : 'BROKEN ✗ — a lower population outranks a higher one'}` +
      `      discrimination ${r.discrimination.toFixed(0)}`
  );
}

// ───────────────────────────────────────────────────────────────────── run
const problem = weightsProblem(DEFAULT_WEIGHTS);
if (problem) {
  console.error(`repid-weight-sim: DEFAULT_WEIGHTS rejected: ${problem}`);
  rmSync(outDir, { recursive: true, force: true });
  process.exit(1);
}

console.log(
  `\nRepID weight simulation — ${N} agents × ${ORDER.length} populations, seed ${SEED}` +
    (PRODUCTION_BFT ? '\n**--production-bft: bftAccuracy forced to 0, as the live path computes it**' : '')
);

const base = evaluate(DEFAULT_WEIGHTS);
render('DEFAULT_WEIGHTS', DEFAULT_WEIGHTS, base);

const candidateJson = value('--weights') ?? value('--compare');
if (candidateJson) {
  let candidate;
  try {
    candidate = JSON.parse(candidateJson);
  } catch (e) {
    console.error(`\nrepid-weight-sim: --weights is not valid JSON: ${e.message}`);
    rmSync(outDir, { recursive: true, force: true });
    process.exit(1);
  }
  const bad = weightsProblem(candidate);
  if (bad) {
    console.error(`\nrepid-weight-sim: candidate rejected by the production validator: ${bad}`);
    rmSync(outDir, { recursive: true, force: true });
    process.exit(1);
  }
  const cand = evaluate(candidate);
  render('CANDIDATE', candidate, cand);
  const delta = cand.discrimination - base.discrimination;
  console.log(
    `\n   VERDICT  discrimination ${base.discrimination.toFixed(0)} → ${cand.discrimination.toFixed(0)} ` +
      `(${delta >= 0 ? '+' : ''}${delta.toFixed(0)})  ${
        delta > 0 ? 'IMPROVED' : delta === 0 ? 'no change — stop tuning this axis' : 'WORSE'
      }`
  );
}

console.log(
  `\n  Tune until discrimination stops rising. Re-run with --seed to size the noise\n` +
    `  floor; a change smaller than that is not an improvement.\n`
);
rmSync(outDir, { recursive: true, force: true });
