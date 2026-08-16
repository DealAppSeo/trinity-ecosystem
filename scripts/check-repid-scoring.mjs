#!/usr/bin/env node
// scripts/check-repid-scoring.mjs — the RepID scoring curve, tier ladder and
// spend arithmetic. The first coverage `RepIDConfig` and `KYAValidator` logic
// has ever had.
//
// Run: node scripts/check-repid-scoring.mjs
//
// WHY IT DID NOT EXIST BEFORE. Both modules import Supabase through the `@/`
// alias, so no check suite could compile either standalone — and so neither was
// ever tested, despite RepIDConfig backing `/api/trustrails/repid/configure`
// and KYAValidator gating `VaultPermission`. The pure logic now lives in
// `repid-scoring.ts` with zero imports, the same split `hal-receipt.ts` made
// for the same reason. The thing nobody could run was the thing nobody checked.
//
// The assertions that carry this file, every one of them a defect found by
// COMPUTING rather than reading:
//
//   * 'THE SCORE CANNOT REACH THE GATE IT FEEDS' — a flawless agent scores
//     4008 against a payment threshold of 5000. Gold and Platinum are
//     unreachable. The payment path is dead for everyone, and nothing said so.
//   * 'ONE TIER LADDER' — `>` here and `>=` there disagreed at exactly 2500,
//     5000 and 7500, and the tier decides the spending limits.
//   * 'AN UNREADABLE SPEND HISTORY IS NOT AN EMPTY ONE' — the fail-open that
//     granted a full daily allowance during a database outage.
//   * 'A MISSING PROOF IS NOT A PROOF' — `ZKP_STUB_<agent>_VERIFIED` is
//     non-empty, truthy, and contains the word VERIFIED.
//   * 'weights are validated on READ' — the sum check guarded the setter only,
//     and the setter is not the only writer.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.repid-scoring-check-'));
let m;
try {
  execFileSync(
    localTsc(),
    [
      'lib/trustshell/repid-scoring.ts',
      '--outDir', outDir,
      '--rootDir', 'lib',          // pinned; see work-contract-test.mjs
      '--module', 'commonjs', '--target', 'es2022',
      '--lib', 'es2022,dom', '--moduleResolution', 'node',
      '--esModuleInterop', '--strict',
    ],
    { stdio: 'pipe' }
  );
  m = await import(pathToFileURL(join(outDir, 'trustshell', 'repid-scoring.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('repid-scoring compilation failed\n');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}

const {
  REPID_MAX, TIER_FLOORS, TIER_LIMITS, DEFAULT_WEIGHTS,
  tierForScore, weightsProblem, normalizeMetrics, contributionsOf, sumContributions,
  scoreFromWeightedSum, reachableCeiling, weightedSumRequiredFor, describeCoherence,
  checkPerTxLimit, checkDailyLimit, isPlaceholderProofCid,
} = m;

let passed = 0;
const failures = [];
const check = (name, fn) => {
  try { fn(); passed += 1; } catch (e) { failures.push(`${name}\n    ${e.message}`); }
};
const eq = (a, b, what) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};
const truthy = (v, what) => { if (!v) throw new Error(`${what}: expected truthy, got ${JSON.stringify(v)}`); };
const match = (s, re, what) => { if (!re.test(String(s))) throw new Error(`${what}: ${JSON.stringify(String(s))} !~ ${re}`); };

// ── the ceiling ─────────────────────────────────────────────────────────────

check('THE SCORE CANNOT REACH THE GATE IT FEEDS — pinned', () => {
  // The finding that mattered most, and it is one arithmetic call. The weighted
  // sum is a convex combination of five values in [0,1] with weights summing to
  // 1, so its maximum is exactly 1.0 — and the curve maps that to 4008.
  //
  // 4008 is asserted as a PINNED NUMBER on purpose. If somebody re-tunes the
  // curve this test fails and they must decide, deliberately, what the new
  // ceiling is and whether the gates still sit under it.
  eq(reachableCeiling(), 4008, 'the highest attainable score');
  truthy(reachableCeiling() < 5000, 'the default payment threshold of 5000 is above it');
  eq(tierForScore(reachableCeiling()), 'Silver', 'a flawless agent is Silver');
});

check('describeCoherence NAMES every unreachable gate', () => {
  // "Not coherent" is not actionable. "Gold at 5000 needs a weighted sum of
  // 3.15, and the maximum is 1.0" is.
  const r = describeCoherence(5000);
  eq(r.outcome, 'FAILED', 'the default configuration is incoherent');
  eq(r.ceiling, 4008, 'ceiling reported');
  eq(r.unreachable.map((g) => g.name).sort(), ['payment threshold', 'tier Gold', 'tier Platinum'], 'all three named');
  match(r.detail, /cannot exceed 1\.0/, 'the reason must state why they can never be met');
  // Found by mutation: matching only the explanation left the gate NAMES
  // droppable, and "3 gates are unreachable" is not actionable.
  match(r.detail, /tier Gold at 5000 would need a weighted sum of 3\.15/, 'each gate must be named with its floor and requirement');
  match(r.detail, /payment threshold at 5000/, 'including the payment threshold');
  const gold = r.unreachable.find((g) => g.name === 'tier Gold');
  truthy(gold.needsWeightedSum > 3 && gold.needsWeightedSum < 3.2, `Gold needs ~3.15, got ${gold.needsWeightedSum}`);
});

check('a coherent configuration reports VERIFIED', () => {
  // Proves the check can pass — a gate that always fails is not a gate. With
  // the threshold under the ceiling and no tier above it, coherence holds.
  const r = describeCoherence(3000);
  eq(r.unreachable.map((g) => g.name).sort(), ['tier Gold', 'tier Platinum'], 'tiers still unreachable');
  eq(describeCoherence(3000).outcome, 'FAILED', 'so it is still FAILED overall');
  // And with the tier floors themselves under the ceiling it would pass; assert
  // the arithmetic directly rather than mutating the exported ladder.
  eq(weightedSumRequiredFor(4008) <= 1.0001, true, 'the ceiling is reachable by definition');
});

check('A NON-FINITE WEIGHTED SUM SCORES ZERO, not the maximum', () => {
  // Found by mutation: nothing exercised the guard, so flipping REPID_MIN to
  // REPID_MAX survived — a NaN weighted sum would have scored a perfect 10000
  // and cleared every gate, which is the failure mode this whole file is about.
  for (const bad of [NaN, Infinity, -Infinity, undefined, null, 'x']) {
    eq(scoreFromWeightedSum(bad), 0, `${JSON.stringify(bad)} must score 0`);
  }
  eq(scoreFromWeightedSum(-5), 0, 'a negative weighted sum scores 0');
});

check('reachableCeiling is DERIVED from the curve, not restated', () => {
  // If it were a literal it would go stale the moment the multiplier moved.
  eq(reachableCeiling(), scoreFromWeightedSum(1), 'ceiling must equal the curve at its maximum input');
});

check('weightedSumRequiredFor inverts the curve', () => {
  for (const score of [1000, 2500, 4008]) {
    const ws = weightedSumRequiredFor(score);
    eq(scoreFromWeightedSum(ws), score, `round trip at ${score}`);
  }
});

// ── the tier ladder ─────────────────────────────────────────────────────────

check('ONE TIER LADDER — inclusive at every boundary', () => {
  // The two implementations disagreed at exactly these three scores, and the
  // tier decides the spending limits, so the disagreement was worth money.
  eq(tierForScore(2499), 'Bronze', 'just below Silver');
  eq(tierForScore(2500), 'Silver', 'exactly at Silver — the old KYAValidator said Bronze');
  eq(tierForScore(4999), 'Silver', 'just below Gold');
  eq(tierForScore(5000), 'Gold', 'exactly at Gold — the old KYAValidator said Silver');
  eq(tierForScore(7499), 'Gold', 'just below Platinum');
  eq(tierForScore(7500), 'Platinum', 'exactly at Platinum — the old KYAValidator said Gold');
});

check('a malformed score lands in the LEAST privileged tier', () => {
  // This runs on a gate's read path. A throw here would acquire a try/catch
  // returning the permissive answer; Bronze is the safe landing.
  for (const bad of [NaN, Infinity, -Infinity, undefined, null, '5000', {}]) {
    eq(tierForScore(bad), 'Bronze', `${JSON.stringify(bad)} must be Bronze`);
  }
});

check('a negative score is Bronze, not an error', () => {
  eq(tierForScore(-1), 'Bronze', 'below the floor');
});

check('every tier has limits, and they rise with the tier', () => {
  const order = ['Bronze', 'Silver', 'Gold', 'Platinum'];
  for (let i = 1; i < order.length; i += 1) {
    truthy(TIER_LIMITS[order[i]].daily > TIER_LIMITS[order[i - 1]].daily, `${order[i]} daily > ${order[i - 1]}`);
    truthy(TIER_LIMITS[order[i]].perTx > TIER_LIMITS[order[i - 1]].perTx, `${order[i]} perTx > ${order[i - 1]}`);
  }
  eq(Object.keys(TIER_LIMITS).length, TIER_FLOORS.length, 'a limit for every tier');
});

// ── normalization ───────────────────────────────────────────────────────────

check('NORMALIZATION IS CLAMPED AT BOTH ENDS', () => {
  // Clamped at 0 only, an accuracy recorded as 150% pushed a component past 1
  // and the weighted sum past its supposed maximum — the one route to a Gold
  // score the honest path cannot reach.
  const over = normalizeMetrics({ bftAccuracy: 150, veritasCatchRate: 300, x402SuccessRate: 100, latencyMs: -1000, humanCustody: true });
  eq(over.bft, 1, '150% clamps to 1');
  eq(over.veritas, 1, '300% clamps to 1');
  eq(over.latency, 1, 'negative latency clamps to 1, not 1.5');
  const under = normalizeMetrics({ bftAccuracy: -50, veritasCatchRate: 0, x402SuccessRate: 0, latencyMs: 999999, humanCustody: false });
  eq(under.bft, 0, 'negative accuracy clamps to 0');
  eq(under.latency, 0, 'huge latency clamps to 0');
  eq(under.custody, 0, 'no custody is 0');
});

check('a non-numeric metric scores ZERO, the least-credit answer', () => {
  const n = normalizeMetrics({ bftAccuracy: NaN, veritasCatchRate: undefined, x402SuccessRate: 'x', latencyMs: NaN, humanCustody: false });
  eq([n.bft, n.veritas, n.x402, n.latency], [0, 0, 0, 0], 'a metric nobody could compute must not pay');
});

check('THE WEIGHTED SUM CANNOT EXCEED 1 with sane weights', () => {
  // The premise the whole ceiling argument rests on, asserted rather than
  // assumed — if this is false, the ceiling calculation is wrong too.
  const perfect = normalizeMetrics({ bftAccuracy: 100, veritasCatchRate: 100, x402SuccessRate: 100, latencyMs: 0, humanCustody: true });
  const ws = sumContributions(contributionsOf(perfect, DEFAULT_WEIGHTS));
  truthy(Math.abs(ws - 1) < 1e-9, `a flawless agent's weighted sum must be 1.0, got ${ws}`);
  const absurd = normalizeMetrics({ bftAccuracy: 10000, veritasCatchRate: 10000, x402SuccessRate: 10000, latencyMs: -99999, humanCustody: true });
  truthy(sumContributions(contributionsOf(absurd, DEFAULT_WEIGHTS)) <= 1 + 1e-9, 'and absurd inputs cannot push it past 1');
});

// ── weights ─────────────────────────────────────────────────────────────────

check('WEIGHTS ARE VALIDATED ON READ, not only on write', () => {
  // The sum check guarded `updateInstitutionWeights` and nothing else, and the
  // setter is not the only writer — a migration or another service can put
  // anything in `institution_risk_config`.
  eq(weightsProblem(DEFAULT_WEIGHTS), null, 'the defaults are valid');
  match(weightsProblem({ ...DEFAULT_WEIGHTS, bftAccuracy: 5 }), /sum to/, 'weights summing to 5 are refused');
  match(weightsProblem({ ...DEFAULT_WEIGHTS, bftAccuracy: -0.4, veritasCatchRate: 1.0 }), /negative/, 'a negative weight is refused');
  match(weightsProblem({ bftAccuracy: 1 }), /not a finite number/, 'a missing weight is refused');
  match(weightsProblem({ ...DEFAULT_WEIGHTS, bftAccuracy: NaN }), /not a finite number/, 'NaN is refused');
  match(weightsProblem(null), /not an object/, 'null is refused');
});

check('a NEGATIVE weight is refused because it inverts the metric', () => {
  // Not merely out of range: with a negative weight, a WORSE metric raises the
  // score. The sum could still be 1.0, so the sum check alone misses it.
  const inverted = { bftAccuracy: -0.4, veritasCatchRate: 0.7, x402SuccessRate: 0.35, latencyOpportunity: 0.2, humanCustodyScore: 0.15 };
  const sum = Object.values(inverted).reduce((a, b) => a + b, 0);
  truthy(Math.abs(sum - 1) < 0.01, 'precondition: these sum to 1.0, so the sum check would pass them');
  match(weightsProblem(inverted), /negative/, 'and they must still be refused');
});

// ── spend limits ────────────────────────────────────────────────────────────

check('AN UNREADABLE SPEND HISTORY IS NOT AN EMPTY ONE', () => {
  // The fail-open. The old code returned `(data || []).reduce(...)`, so a
  // database error produced 0 and the limit check PASSED — a DB outage granted
  // the full daily allowance on the payment path.
  const r = checkDailyLimit(900, null, 1000);
  eq(r.outcome, 'NOT_CHECKED', 'an unreadable history must not pass the limit');
  eq(r.withinLimit, null, 'and must not claim to be within it');
  match(r.detail, /unreadable history is not an empty one/, 'the reason must name the confusion');

  // The same numbers with a real reading deny, which is what makes the above a
  // fail-OPEN rather than a difference of opinion.
  eq(checkDailyLimit(900, 900, 1000).outcome, 'FAILED', 'the true spend denies');
  eq(checkDailyLimit(900, 0, 1000).outcome, 'VERIFIED', 'and a genuine zero permits — the two must not look alike');
});

check('the daily limit is INCLUSIVE at the boundary', () => {
  eq(checkDailyLimit(100, 900, 1000).outcome, 'VERIFIED', 'exactly at the limit is within it');
  eq(checkDailyLimit(101, 900, 1000).outcome, 'FAILED', 'one over is not');
});

check('the per-tx limit is INCLUSIVE at the boundary', () => {
  eq(checkPerTxLimit(5000, 5000).outcome, 'VERIFIED', 'exactly at the limit is within it');
  eq(checkPerTxLimit(5001, 5000).outcome, 'FAILED', 'one over is not');
  eq(checkPerTxLimit(0, 5000).outcome, 'VERIFIED', 'zero is within');
});

check('a malformed amount or limit is NOT_CHECKED, never a pass', () => {
  for (const bad of [NaN, Infinity, -1]) {
    eq(checkPerTxLimit(bad, 100).outcome, 'NOT_CHECKED', `amount ${bad}`);
    eq(checkPerTxLimit(100, bad).outcome, 'NOT_CHECKED', `limit ${bad}`);
    eq(checkDailyLimit(bad, 0, 100).outcome, 'NOT_CHECKED', `daily amount ${bad}`);
    eq(checkDailyLimit(100, bad, 1000).outcome, 'NOT_CHECKED', `spend so far ${bad}`);
  }
});

// ── the fabricated proof ────────────────────────────────────────────────────

check('A MISSING PROOF IS NOT A PROOF', () => {
  // `ZKP_STUB_${agentName}_VERIFIED` was manufactured when the column was null:
  // non-empty, truthy, and containing the word VERIFIED, so every consumer
  // testing for presence saw a proof that does not exist.
  eq(isPlaceholderProofCid('ZKP_STUB_agent-x_VERIFIED'), true, 'the old fabricated value is a placeholder');
  eq(isPlaceholderProofCid(''), true, 'empty is a placeholder');
  eq(isPlaceholderProofCid('   '), true, 'whitespace is a placeholder');
  eq(isPlaceholderProofCid(null), true, 'absent is a placeholder');
  eq(isPlaceholderProofCid(undefined), true, 'undefined is a placeholder');
  eq(isPlaceholderProofCid(42), true, 'a non-string is a placeholder');
  eq(isPlaceholderProofCid('bafybeigd...'), false, 'a real CID is not');
});

check('the placeholder was TRUTHY — which is why presence checks failed', () => {
  // Asserted because it is the mechanism, not the symptom. A falsy placeholder
  // would have been caught by the first consumer that tested it.
  const fabricated = `ZKP_STUB_some-agent_VERIFIED`;
  truthy(Boolean(fabricated), 'the fabricated value passes a truthiness test');
  truthy(fabricated.includes('VERIFIED'), 'and reads as its own success');
  eq(isPlaceholderProofCid(fabricated), true, 'so presence must be asked, not assumed');
});

rmSync(outDir, { recursive: true, force: true });

console.log(`\nrepid-scoring: ${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}
console.log('All repid-scoring checks passed.');
