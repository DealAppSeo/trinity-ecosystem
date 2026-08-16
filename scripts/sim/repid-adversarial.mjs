#!/usr/bin/env node
// scripts/sim/repid-adversarial.mjs — what does an agent optimising for SCORE do?
//
// Run: node scripts/sim/repid-adversarial.mjs
//
// RepID gates money: the tier decides `TIER_LIMITS`, and the score decides the
// tier. Every scoring function that gates a payout is also an objective
// function somebody will optimise against. This asks what that optimisation
// actually produces, before an agent does it for us.
//
// IT DRIVES THE PRODUCTION MODULE. Every number below comes from the real
// `repid-scoring.ts` — the same code the payment path calls. A simulation of a
// reimplementation proves nothing about production, which is the whole trap
// this repo keeps logging.
//
// Four questions, each answered by computation:
//
//   1. CHEAPEST PATH  — what is the least an agent can do and still clear each
//      gate? Not "what does a good agent score", but "what is the minimum".
//   2. MARGINAL VALUE — where on the range does improvement pay best? A trust
//      curve that pays more for bad->mediocre than for good->excellent is
//      rewarding the wrong move.
//   3. SELF-ASSERTED  — how much of the score rests on signals nobody verifies?
//   4. POPULATIONS    — what tier distribution do realistic agent mixes give?

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const outDir = mkdtempSync(join(process.cwd(), '.repid-sim-'));
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
  DEFAULT_WEIGHTS, TIER_FLOORS, TIER_LIMITS,
  normalizeMetrics, contributionsOf, sumContributions,
  scoreFromWeightedSum, tierForScore, weightedSumRequiredFor, reachableCeiling,
} = m;

const W = DEFAULT_WEIGHTS;
const pad = (s, n) => String(s).padEnd(n);
const pct = (x) => `${(100 * x).toFixed(1)}%`;

console.log('='.repeat(78));
console.log('RepID ADVERSARIAL SIMULATION — driven through the production module');
console.log('='.repeat(78));
console.log(`\nceiling ${reachableCeiling()}   weights ${JSON.stringify(W)}`);

// ── 1. THE CHEAPEST PATH TO EACH GATE ───────────────────────────────────────
//
// The five signals are not equally expensive to move. `humanCustody` is a
// BOOLEAN read from the KYA registry — ZKPAttestation.ts calls it "a registered
// fact, not a proven one" — so it costs an agent nothing but a flag. Ask what
// remains once the free credit is taken.

console.log(`\n${'─'.repeat(78)}\n1. CHEAPEST PATH TO EACH GATE\n${'─'.repeat(78)}`);
console.log('\nWeight per signal, and what each is worth at full marks:');
for (const [k, w] of Object.entries(W)) console.log(`  ${pad(k, 20)} weight ${pad(w, 6)} max contribution ${w.toFixed(3)}`);

const CUSTODY_W = W.humanCustodyScore;
console.log(`\nhumanCustody is BINARY and self-asserted (KYA registry flag), so ${CUSTODY_W} of the`);
console.log('weighted sum is available for the cost of setting a flag. Everything below');
console.log('assumes an adversary takes it.');

for (const { tier, floor } of [...TIER_FLOORS].reverse()) {
  if (floor === 0) continue;
  const needWs = weightedSumRequiredFor(floor);
  const afterCustody = needWs - CUSTODY_W;
  console.log(`\n  ${tier} (score ${floor}, daily limit ${TIER_LIMITS[tier].daily.toLocaleString()} USDC)`);
  console.log(`    needs weightedSum ${needWs.toFixed(4)}; after the free custody flag, ${afterCustody.toFixed(4)} remains`);
  if (afterCustody <= 0) {
    console.log(`    *** THE CUSTODY FLAG ALONE CLEARS THIS GATE ***`);
    continue;
  }
  // Cheapest single-signal route: the highest-weighted signal needs the least
  // performance to supply a given contribution.
  for (const [k, w] of Object.entries(W)) {
    if (k === 'humanCustodyScore') continue;
    const needed = afterCustody / w;
    const verdict = needed > 1 ? 'IMPOSSIBLE alone' : `${pct(needed)} on this signal alone`;
    console.log(`    via ${pad(k, 20)} ${verdict}`);
  }
}

// ── 2. MARGINAL VALUE OF IMPROVEMENT ────────────────────────────────────────
//
// log10 compresses the top of the range. Measure how much score one unit of
// real improvement buys, at each point on the range.

console.log(`\n${'─'.repeat(78)}\n2. MARGINAL VALUE — where does improvement actually pay?\n${'─'.repeat(78)}`);
console.log('\n  weightedSum   score   +0.01 ws buys   tier');
const STEP = 0.01;
let firstDelta = null, lastDelta = null;
for (const ws of [0.01, 0.05, 0.10, 0.20, 0.31, 0.50, 0.75, 0.99]) {
  const s = scoreFromWeightedSum(ws);
  const d = scoreFromWeightedSum(ws + STEP) - s;
  if (firstDelta === null) firstDelta = d;
  lastDelta = d;
  console.log(`  ${pad(ws.toFixed(2), 13)} ${pad(s, 7)} ${pad('+' + d, 15)} ${tierForScore(s)}`);
}
console.log(`\n  An identical +0.01 of real improvement is worth ${firstDelta} points at the bottom`);
console.log(`  and ${lastDelta} at the top — a ${(firstDelta / Math.max(lastDelta, 1)).toFixed(1)}x difference.`);
console.log('  The curve pays MOST for going from terrible to poor, and LEAST for going');
console.log('  from good to excellent. For a reputation gate on payments, that is the');
console.log('  opposite of the incentive you want at the top of the range.');

// ── 3. HOW MUCH OF THE SCORE IS SELF-ASSERTED? ──────────────────────────────

console.log(`\n${'─'.repeat(78)}\n3. SELF-ASSERTED vs MEASURED\n${'─'.repeat(78)}`);
const platinumWs = weightedSubFor(7500);
function weightedSubFor(floor) { return weightedSumRequiredFor(floor); }
console.log(`\n  Platinum needs weightedSum ${platinumWs.toFixed(4)}.`);
console.log(`  The custody flag supplies ${CUSTODY_W} of it = ${pct(CUSTODY_W / platinumWs)} of the requirement,`);
console.log('  from a registry boolean that nothing in this repo verifies.');

// ── 4. POPULATION SIMULATION ────────────────────────────────────────────────
//
// Not a uniform sweep over weightedSum — that is what the docstring in
// repid-scoring.ts already reports, and it is NOT a population. It answers
// "how much of the INPUT RANGE maps to each tier", which is a property of the
// curve, not of any set of agents. Real agents are not uniform over [0,1].

console.log(`\n${'─'.repeat(78)}\n4. POPULATIONS — the distribution the curve gives REAL agent mixes\n${'─'.repeat(78)}`);
console.log('\n  NOTE: the uniform-over-weightedSum figure recorded in repid-scoring.ts');
console.log('  (Platinum 69.4%) describes the CURVE, not a population. No agent set is');
console.log('  uniform over [0,1]. These are populations.\n');

// Deterministic LCG — no Math.random, so this is reproducible and can be pinned.
let seed = 20260816;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
// Beta-ish via mean of k uniforms — tighter around the mean as k rises.
const around = (mean, spread) => clamp01(mean + (rand() + rand() + rand() - 1.5) * spread);

const POPULATIONS = [
  { name: 'strong fleet',  bft: 0.92, veritas: 0.85, x402: 0.97, latencyMs: 250,  custody: 1.00 },
  { name: 'typical fleet', bft: 0.75, veritas: 0.60, x402: 0.90, latencyMs: 700,  custody: 0.50 },
  { name: 'weak fleet',    bft: 0.45, veritas: 0.30, x402: 0.70, latencyMs: 1500, custody: 0.10 },
  { name: 'cold start',    bft: 0.00, veritas: 0.00, x402: 0.00, latencyMs: 2000, custody: 0.00 },
];

const N = 20000;
for (const p of POPULATIONS) {
  const bands = { Bronze: 0, Silver: 0, Gold: 0, Platinum: 0 };
  let sumScore = 0;
  for (let i = 0; i < N; i += 1) {
    const raw = {
      bftAccuracy: around(p.bft, 0.15) * 100,
      veritasCatchRate: around(p.veritas, 0.15) * 100,
      x402SuccessRate: around(p.x402, 0.10) * 100,
      latencyMs: p.latencyMs * (0.6 + rand() * 0.8),
      humanCustody: rand() < p.custody,
    };
    const score = scoreFromWeightedSum(sumContributions(contributionsOf(normalizeMetrics(raw), W)));
    bands[tierForScore(score)] += 1;
    sumScore += score;
  }
  const line = Object.entries(bands).map(([t, n]) => `${t} ${pad(pct(n / N), 7)}`).join(' ');
  console.log(`  ${pad(p.name, 15)} mean score ${pad(Math.round(sumScore / N), 6)}  ${line}`);
}

console.log('\n  Read the "weak fleet" row against TIER_LIMITS. A fleet averaging 45% BFT');
console.log('  accuracy and 30% catch rate is not a fleet anyone would hand a large daily');
console.log('  limit to by choice.');

rmSync(outDir, { recursive: true, force: true });
console.log(`\n${'='.repeat(78)}\n`);
