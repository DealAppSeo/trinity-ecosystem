#!/usr/bin/env node
// scripts/sim/repid-calibration.mjs — can the tier ladder tell agents apart?
//
// Run: node scripts/sim/repid-calibration.mjs
//
// `repid-adversarial.mjs` found that every operating population lands in
// Platinum — a WEAK fleet (45% BFT accuracy, 30% catch rate) is 99% Platinum
// and holds the 500,000 USDC daily limit. This asks the constructive question:
// what would have to change for the ladder to discriminate, and what does each
// option cost?
//
// THE SHAPE OF THE PROBLEM. `score = M * log10(1 + ws * S)` with M=5000, S=100.
// log10 compresses hard: the whole operating range of a real fleet — weighted
// sums roughly 0.35 to 0.85 — maps into the top ~1,700 points of a 10,000-point
// scale. A ladder with floors at 2500/5000/7500 cannot separate agents that all
// score above 8000.
//
// This is the SAME defect as the original finding, inverted. Before the
// multiplier was raised the gate never OPENED (ceiling 4008 < threshold 5000).
// After, it never CLOSES. Both come from one omission: the floors were never
// calibrated against the curve, only against each other.
//
// Reported, not applied. Which option to take changes every agent's tier and
// therefore their spending limits — an operator's decision, exactly as the
// multiplier was.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const outDir = mkdtempSync(join(process.cwd(), '.repid-cal-'));
let m;
try {
  execFileSync(
    join(process.cwd(), 'node_modules/.bin/tsc'),
    ['lib/trustshell/repid-scoring.ts', '--outDir', outDir, '--rootDir', 'lib',
     '--module', 'commonjs', '--target', 'es2022', '--lib', 'es2022,dom',
     '--moduleResolution', 'node', '--esModuleInterop', '--strict'],
    { stdio: 'pipe' }
  );
  m = await import(pathToFileURL(join(outDir, 'trustshell', 'repid-scoring.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('compile failed\n', e.stdout?.toString() || e.message);
  process.exit(1);
}

const {
  DEFAULT_WEIGHTS, SCORE_LOG_MULTIPLIER, SCORE_LOG_INPUT_SCALE, REPID_MAX,
  normalizeMetrics, contributionsOf, sumContributions,
} = m;

const W = DEFAULT_WEIGHTS;
const pad = (s, n) => String(s).padEnd(n);
const pctS = (x) => `${(100 * x).toFixed(1)}%`;

// Deterministic. No Math.random, so the numbers below are reproducible.
let seed = 20260816;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const around = (mean, spread) => clamp01(mean + (rand() + rand() + rand() - 1.5) * spread);

const POPULATIONS = [
  { name: 'strong',  bft: 0.92, veritas: 0.85, x402: 0.97, latencyMs: 250,  custody: 1.00 },
  { name: 'typical', bft: 0.75, veritas: 0.60, x402: 0.90, latencyMs: 700,  custody: 0.50 },
  { name: 'weak',    bft: 0.45, veritas: 0.30, x402: 0.70, latencyMs: 1500, custody: 0.10 },
  { name: 'cold',    bft: 0.00, veritas: 0.00, x402: 0.00, latencyMs: 2000, custody: 0.00 },
];

const N = 20000;
/** Weighted sums per population — the curve-independent part. */
function sampleWeightedSums(p) {
  const out = [];
  for (let i = 0; i < N; i += 1) {
    const raw = {
      bftAccuracy: around(p.bft, 0.15) * 100,
      veritasCatchRate: around(p.veritas, 0.15) * 100,
      x402SuccessRate: around(p.x402, 0.10) * 100,
      latencyMs: p.latencyMs * (0.6 + rand() * 0.8),
      humanCustody: rand() < p.custody,
    };
    out.push(sumContributions(contributionsOf(normalizeMetrics(raw), W)));
  }
  return out.sort((a, b) => a - b);
}
seed = 20260816;
const SAMPLES = Object.fromEntries(POPULATIONS.map((p) => [p.name, sampleWeightedSums(p)]));
const q = (arr, f) => arr[Math.min(arr.length - 1, Math.floor(f * arr.length))];

console.log('='.repeat(78));
console.log('RepID TIER CALIBRATION — can the ladder tell agents apart?');
console.log('='.repeat(78));

console.log(`\n${'─'.repeat(78)}\nA. THE UNDERLYING SIGNAL separates cleanly. The CURVE is what collapses it.\n${'─'.repeat(78)}`);
console.log('\n  population   weightedSum p10 / median / p90');
for (const p of POPULATIONS) {
  const s = SAMPLES[p.name];
  console.log(`  ${pad(p.name, 12)} ${q(s, 0.1).toFixed(4)} / ${q(s, 0.5).toFixed(4)} / ${q(s, 0.9).toFixed(4)}`);
}
console.log('\n  Those are well separated — weak and strong barely overlap. Now the curve:');

const curve = (ws, mult, scale) =>
  Math.min(REPID_MAX, Math.max(0, Math.floor(mult * Math.log10(1 + Math.max(0, ws) * scale))));

console.log(`\n  population   score p10 / median / p90   (M=${SCORE_LOG_MULTIPLIER}, S=${SCORE_LOG_INPUT_SCALE})`);
for (const p of POPULATIONS) {
  const s = SAMPLES[p.name];
  const f = (x) => curve(q(s, x), SCORE_LOG_MULTIPLIER, SCORE_LOG_INPUT_SCALE);
  console.log(`  ${pad(p.name, 12)} ${pad(f(0.1), 6)} / ${pad(f(0.5), 6)} / ${f(0.9)}`);
}
const weakMed = curve(q(SAMPLES.weak, 0.5), SCORE_LOG_MULTIPLIER, SCORE_LOG_INPUT_SCALE);
const strongMed = curve(q(SAMPLES.strong, 0.5), SCORE_LOG_MULTIPLIER, SCORE_LOG_INPUT_SCALE);
console.log(`\n  weak median ${weakMed} vs strong median ${strongMed} — a spread of ${strongMed - weakMed} points`);
console.log(`  on a 10,000-point scale, with every floor above 2500 sitting below BOTH.`);

// ── OPTION A: keep the curve, move the floors ───────────────────────────────
console.log(`\n${'─'.repeat(78)}\nOPTION A — keep the curve, move the FLOORS to where the agents are\n${'─'.repeat(78)}`);
const floorA = {
  Silver: curve(q(SAMPLES.cold, 0.9), SCORE_LOG_MULTIPLIER, SCORE_LOG_INPUT_SCALE),
  Gold: curve(q(SAMPLES.weak, 0.75), SCORE_LOG_MULTIPLIER, SCORE_LOG_INPUT_SCALE),
  Platinum: curve(q(SAMPLES.typical, 0.75), SCORE_LOG_MULTIPLIER, SCORE_LOG_INPUT_SCALE),
};
console.log(`\n  Silver ${floorA.Silver}   Gold ${floorA.Gold}   Platinum ${floorA.Platinum}`);
report(floorA, SCORE_LOG_MULTIPLIER, SCORE_LOG_INPUT_SCALE);
console.log('\n  COST: the floors become opaque round-ish numbers with no meaning outside');
console.log('  this curve, and any future multiplier change silently invalidates them —');
console.log('  which is exactly how this defect arrived. Cheap now, fragile later.');

// ── OPTION B: reduce the input scale so the curve stops saturating ──────────
console.log(`\n${'─'.repeat(78)}\nOPTION B — keep the floors, reduce the INPUT SCALE so the curve spreads\n${'─'.repeat(78)}`);
// GRID WIDTH IS PART OF THE RESULT. The first version of this search capped
// the multiplier at 12,000 and reported "no pair separates these populations —
// the log form cannot do it". That was FALSE, and it is the shape of error this
// repo keeps logging: a negative result from a grid too narrow to contain the
// answer, stated as a property of the system. The working region needs a small
// input scale (so log10 stops saturating) paired with a LARGE multiplier (to
// restore the range), around S=1 and M~30,000 — outside the old grid entirely.
// Anything that reports IMPOSSIBLE must show that it looked where the answer is.
let best = null;
for (const scale of [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5, 8, 12, 20, 35, 50, 75, 100]) {
  for (let mult = 1000; mult <= 80000; mult += 100) {
    if (curve(1, mult, scale) < 9000) continue;          // ceiling must stay usable
    const sc = (name, f) => curve(q(SAMPLES[name], f), mult, scale);
    // Want: cold below Silver, weak around Silver/Gold, typical Gold, strong Platinum.
    const ok =
      sc('cold', 0.9) < 2500 &&
      sc('weak', 0.5) >= 2500 && sc('weak', 0.5) < 5000 &&
      sc('typical', 0.5) >= 5000 && sc('typical', 0.5) < 7500 &&
      sc('strong', 0.5) >= 7500;
    if (!ok) continue;
    const spread = sc('strong', 0.5) - sc('weak', 0.5);
    if (!best || spread > best.spread) best = { scale, mult, spread };
  }
}
if (best) {
  console.log(`\n  SCORE_LOG_INPUT_SCALE ${best.scale}, SCORE_LOG_MULTIPLIER ${best.mult}`);
  console.log(`  ceiling ${curve(1, best.mult, best.scale)}, weak->strong spread ${best.spread} points`);
  console.log(`  Floors stay 2500 / 5000 / 7500.\n`);
  console.log('  population   score p10 / median / p90');
  for (const p of POPULATIONS) {
    const s = SAMPLES[p.name];
    const f = (x) => curve(q(s, x), best.mult, best.scale);
    console.log(`  ${pad(p.name, 12)} ${pad(f(0.1), 6)} / ${pad(f(0.5), 6)} / ${f(0.9)}`);
  }
  report({ Silver: 2500, Gold: 5000, Platinum: 7500 }, best.mult, best.scale);
  console.log('\n  COST: every existing score changes, so any stored score or published');
  console.log('  tier is invalidated at once. The floors keep their plain meaning and');
  console.log('  survive a future re-tune, because the curve now spans the real range.');
} else {
  console.log('\n  NO (scale, multiplier) pair in the searched grid separates these');
  console.log('  populations across the existing floors. That is itself the finding:');
  console.log('  the log form cannot do it, and the curve shape must change.');
}

function report(floors, mult, scale) {
  console.log('\n  resulting distribution:');
  for (const p of POPULATIONS) {
    const bands = { Bronze: 0, Silver: 0, Gold: 0, Platinum: 0 };
    for (const ws of SAMPLES[p.name]) {
      const s = curve(ws, mult, scale);
      bands[s >= floors.Platinum ? 'Platinum' : s >= floors.Gold ? 'Gold' : s >= floors.Silver ? 'Silver' : 'Bronze'] += 1;
    }
    console.log(`    ${pad(p.name, 10)} ${Object.entries(bands).map(([t, n]) => `${t} ${pad(pctS(n / N), 7)}`).join(' ')}`);
  }
}

rmSync(outDir, { recursive: true, force: true });
console.log(`\n${'='.repeat(78)}\n`);
