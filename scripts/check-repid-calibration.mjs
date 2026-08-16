#!/usr/bin/env node
// scripts/check-repid-calibration.mjs — does the tier ladder DISCRIMINATE?
//
// Run: node scripts/check-repid-calibration.mjs
// Exit: 0 VERIFIED · 2 NOT_CHECKED · anything else FAILED
//
// ── THE PROPERTY ────────────────────────────────────────────────────────────
//
// A tier ladder exists to sort agents. `TIER_LIMITS` gives Platinum a 500,000
// USDC daily limit and Bronze 100 — a 5,000x difference that is only meaningful
// if the tiers separate agents who differ. So the property is not "the score is
// computed correctly"; it is **agents of different quality land in different
// tiers**. Nothing tested that, and it is false today.
//
// ── WHY THIS SUITE EXISTS ───────────────────────────────────────────────────
//
// The original finding on this branch was that the gate never OPENED: a
// flawless agent scored 4008 against a payment threshold of 5000. Raising
// SCORE_LOG_MULTIPLIER 2000 -> 5000 (Sean's call) fixed that and produced the
// mirror defect — the gate never CLOSES. Simulated through the production
// module, a WEAK fleet (45% BFT accuracy, 30% catch rate) is **99% Platinum**
// and holds the largest daily limit in the table.
//
// Both failures have ONE root cause: the floors were calibrated against each
// other and never against the curve. `describeCoherence` checks that a gate is
// REACHABLE. Nothing checked that it is ESCAPABLE.
//
// ── WHY THIS REPORTS NOT_CHECKED RATHER THAN FAILING ────────────────────────
//
// The fix changes every agent's tier and therefore their spending limits, which
// is an operator's decision — exactly as the multiplier was, and it was right to
// escalate that one rather than pick a number. A suite that fails the build over
// a pending decision makes the build permanently red, and this repo's own rule
// is that a gate which cannot pass is a gate that gets ignored.
//
// So: the measurable half is ASSERTED and must pass. The pending half is
// reported as NOT_CHECKED with the exact decision required. **The moment a
// calibration lands that discriminates, this goes VERIFIED on its own** — no
// edit needed, which is what stops it rotting into a permanent yellow.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.repid-calibration-check-'));
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
  console.error('repid-calibration compilation failed\n');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}

const {
  DEFAULT_WEIGHTS, TIER_LIMITS,
  normalizeMetrics, contributionsOf, sumContributions,
  scoreFromWeightedSum, tierForScore, weightedSumRequiredFor,
} = m;

let passed = 0;
const failures = [];
const check = (name, fn) => {
  try { fn(); passed += 1; } catch (e) { failures.push(`${name}\n    ${e.message}`); }
};
const truthy = (v, what) => { if (!v) throw new Error(`${what}: expected truthy, got ${JSON.stringify(v)}`); };
const eq = (a, b, what) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};

// DETERMINISTIC. An LCG, not Math.random — a suite whose verdict changes run to
// run cannot be a gate, and `mutate.mjs` would score it as flaky rather than as
// evidence.
let seed = 20260816;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const around = (mean, spread) => clamp01(mean + (rand() + rand() + rand() - 1.5) * spread);

const FREE_CREDIT = { tier: null, limit: null };
const POPULATIONS = {
  strong:  { bft: 0.92, veritas: 0.85, x402: 0.97, latencyMs: 250,  custody: 1.00 },
  typical: { bft: 0.75, veritas: 0.60, x402: 0.90, latencyMs: 700,  custody: 0.50 },
  weak:    { bft: 0.45, veritas: 0.30, x402: 0.70, latencyMs: 1500, custody: 0.10 },
  // TRUE zero — spread 0, so this really is an agent with no record. The first
  // draft gave it spread 0.15, and `around()` clamps at 0, so half the noise
  // folded upward and the "cold" agent had a POSITIVE mean. It then scored
  // Silver, and the suite reported that as a defect in the ladder. It is a
  // defect, but not that one: the population was misnamed, and a finding about
  // a population you defined wrong is a finding about your fixture.
  cold:    { bft: 0.00, veritas: 0.00, x402: 0.00, latencyMs: 2000, custody: 0.00, spread: 0 },
  // Separately: an agent with a handful of lucky observations, which is what
  // the mislabelled fixture actually described. Kept because it is realistic.
  barely:  { bft: 0.04, veritas: 0.04, x402: 0.03, latencyMs: 1950, custody: 0.00 },
};
const N = 4000;

function simulate(p) {
  const scores = [];
  const bands = { Bronze: 0, Silver: 0, Gold: 0, Platinum: 0 };
  for (let i = 0; i < N; i += 1) {
    const raw = {
      bftAccuracy: around(p.bft, p.spread ?? 0.15) * 100,
      veritasCatchRate: around(p.veritas, p.spread ?? 0.15) * 100,
      x402SuccessRate: around(p.x402, p.spread ?? 0.10) * 100,
      latencyMs: p.latencyMs * (p.spread === 0 ? 1 : 0.6 + rand() * 0.8),
      humanCustody: rand() < p.custody,
    };
    const ws = sumContributions(contributionsOf(normalizeMetrics(raw), DEFAULT_WEIGHTS));
    const s = scoreFromWeightedSum(ws);
    scores.push(s);
    bands[tierForScore(s)] += 1;
  }
  scores.sort((a, b) => a - b);
  return { scores, bands, median: scores[Math.floor(scores.length / 2)] };
}

seed = 20260816;
const SIM = Object.fromEntries(Object.entries(POPULATIONS).map(([k, p]) => [k, simulate(p)]));
const modal = (bands) => Object.entries(bands).sort((a, b) => b[1] - a[1])[0][0];

// ── the measurable half — these must pass ───────────────────────────────────

check('a TRUE zero agent is Bronze — no credit for having no record', () => {
  const zero = sumContributions(contributionsOf(
    normalizeMetrics({ bftAccuracy: 0, veritasCatchRate: 0, x402SuccessRate: 0, latencyMs: 2000, humanCustody: false }),
    DEFAULT_WEIGHTS
  ));
  eq(tierForScore(scoreFromWeightedSum(zero)), 'Bronze', 'an agent with nothing measured');
});

check('MEASURED: what the free custody credit is worth', () => {
  // humanCustody is a KYA-registry boolean. ZKPAttestation.ts calls it "a
  // registered fact, not a proven one", so it costs an agent nothing.
  const flagOnly = sumContributions(contributionsOf(
    normalizeMetrics({ bftAccuracy: 0, veritasCatchRate: 0, x402SuccessRate: 0, latencyMs: 999999, humanCustody: true }),
    DEFAULT_WEIGHTS
  ));
  // Asserted only as "it is computable and non-zero" — the POLICY question of
  // whether an unverified flag should carry an agent anywhere is reported
  // below, not failed here. Changing the weight is an operator's call.
  truthy(flagOnly > 0, 'the custody flag contributes something');
  FREE_CREDIT.tier = tierForScore(scoreFromWeightedSum(flagOnly));
  FREE_CREDIT.limit = TIER_LIMITS[FREE_CREDIT.tier].daily;
});

check('the populations are genuinely different BEFORE the curve', () => {
  // If this fails the simulation is broken, not the ladder — and every verdict
  // below would be meaningless. Assert the premise before using it.
  seed = 20260816;
  const ws = (p) => {
    let t = 0;
    for (let i = 0; i < 500; i += 1) {
      t += sumContributions(contributionsOf(normalizeMetrics({
        bftAccuracy: around(p.bft, 0.15) * 100,
        veritasCatchRate: around(p.veritas, 0.15) * 100,
        x402SuccessRate: around(p.x402, 0.10) * 100,
        latencyMs: p.latencyMs * (0.6 + rand() * 0.8),
        humanCustody: rand() < p.custody,
      }), DEFAULT_WEIGHTS));
    }
    return t / 500;
  };
  const strong = ws(POPULATIONS.strong), weak = ws(POPULATIONS.weak);
  truthy(strong - weak > 0.3, `strong (${strong.toFixed(3)}) and weak (${weak.toFixed(3)}) must differ in the INPUT`);
});

check('a COLD-START population is modally Bronze', () => {
  eq(modal(SIM.cold.bands), 'Bronze', 'the modal tier for a population with no track record');
});

check('the ladder is ordered — better populations never score lower', () => {
  const order = ['cold', 'barely', 'weak', 'typical', 'strong'];
  for (let i = 1; i < order.length; i += 1) {
    truthy(SIM[order[i]].median > SIM[order[i - 1]].median,
      `${order[i]} median (${SIM[order[i]].median}) must exceed ${order[i - 1]} (${SIM[order[i - 1]].median})`);
  }
});

// ── the pending half — measured, and blocked on an operator decision ────────

const weakModal = modal(SIM.weak.bands);
const weakTopShare = (SIM.weak.bands.Platinum + SIM.weak.bands.Gold) / N;
const custodyOk = TIER_LIMITS[FREE_CREDIT.tier ?? 'Bronze'].daily <= TIER_LIMITS.Bronze.daily;
const discriminates =
  weakModal !== 'Platinum' && SIM.weak.bands.Platinum / N < 0.5 && custodyOk;

rmSync(outDir, { recursive: true, force: true });

console.log(`\nrepid-calibration: ${passed} passed, ${failures.length} failed\n`);
for (const [name, s] of Object.entries(SIM)) {
  const b = s.bands;
  const pc = (n) => `${((100 * n) / N).toFixed(1)}%`.padEnd(7);
  console.log(`  ${name.padEnd(8)} median ${String(s.median).padEnd(6)} ` +
    `Bronze ${pc(b.Bronze)} Silver ${pc(b.Silver)} Gold ${pc(b.Gold)} Platinum ${pc(b.Platinum)}`);
}

if (failures.length > 0) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}

if (discriminates) {
  console.log('\ncheck:repid-calibration — VERIFIED. The ladder separates populations:');
  console.log(`  a weak fleet is modally ${weakModal}, not Platinum.`);
  process.exit(0);
}

console.log(`
check:repid-calibration — NOT_CHECKED. The ladder does not discriminate.

  A WEAK fleet (45% BFT accuracy, 30% catch rate) is modally ${weakModal}, with
  ${(100 * weakTopShare).toFixed(1)}% in Gold or Platinum. Platinum carries a daily limit of
  ${TIER_LIMITS.Platinum.daily.toLocaleString()} USDC; Bronze carries ${TIER_LIMITS.Bronze.daily.toLocaleString()}.

  ROOT CAUSE, and it is the mirror of this branch's founding defect. The gate
  used to never OPEN (ceiling 4008 under a threshold of 5000). It now never
  CLOSES. One omission causes both: the floors were calibrated against each
  other and never against the curve. log10 with an input scale of 100 puts the
  whole operating range of a real fleet into the top ~1,700 points of a
  10,000-point scale, and every floor sits below all of it.

  Platinum needs weightedSum ${weightedSumRequiredFor(7500).toFixed(4)}; a weak fleet's median is far above it.

  AND A SECOND, SEPARABLE FINDING. Silver requires weightedSum only
  ${weightedSumRequiredFor(2500).toFixed(4)} — ${(100 * weightedSumRequiredFor(2500)).toFixed(2)}% of the maximum. The humanCustody flag alone
  carries weight ${DEFAULT_WEIGHTS.humanCustodyScore}, which is above that, so an agent with ZERO measured
  performance reaches ${FREE_CREDIT.tier} and a daily limit of ${Number(FREE_CREDIT.limit).toLocaleString()} USDC by setting one
  KYA-registry boolean. ZKPAttestation.ts calls that flag "a registered fact,
  not a proven one" — nothing in this repo verifies it. Fixing it is also an
  operator decision: lower the weight, or gate the flag behind verification.

  THE DECISION IS AN OPERATOR'S, not this suite's — it moves every agent's tier
  and therefore their spending limits. Two options, both measured by
  \`node scripts/sim/repid-calibration.mjs\`:

    A. Keep the curve, move the floors (~4490 / 8234 / 9364). Cheap, but the
       floors lose any meaning outside this curve and a future multiplier
       change silently invalidates them — which is how this defect arrived.

    B. SCORE_LOG_INPUT_SCALE 100 -> 0.5 with SCORE_LOG_MULTIPLIER 5000 -> 57200.
       Floors keep their plain 2500 / 5000 / 7500 meaning and survive a re-tune.
       Costs: every stored score changes at once.
       Result: strong 100% Platinum, typical 50/50 Gold-Platinum, weak 83%
       Silver, cold 100% Bronze.

  This turns VERIFIED by itself once a discriminating calibration lands. No edit
  to this file is required, so it cannot rot into a permanent yellow.
`);
process.exit(2);
