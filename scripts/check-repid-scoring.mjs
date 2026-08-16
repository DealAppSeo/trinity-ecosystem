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

check('THE SCORE REACHES THE GATE IT FEEDS — pinned', () => {
  // Was 4008 against a threshold of 5000, which closed the payment path for
  // everyone. The multiplier is now 5000 (Sean's decision, 2026-08-16).
  //
  // Still a PINNED NUMBER, and that is the point of it: a future re-tune fails
  // here and forces someone to decide deliberately what the new ceiling is and
  // whether the gates still sit under it, rather than rediscovering a dead
  // payment path months later.
  eq(reachableCeiling(), 10000, 'the highest attainable score');
  truthy(reachableCeiling() >= 5000, 'the default payment threshold is now reachable');
  eq(tierForScore(reachableCeiling()), 'Platinum', 'a flawless agent is Platinum');
  eq(describeCoherence(5000).outcome, 'VERIFIED', 'and the default configuration is coherent');
});

check('THE CAP NOW BINDS, which it did not before', () => {
  // At multiplier 2000 the curve maxed at 4008 and the 10000 cap was decorative.
  // At 5000 a flawless agent computes 10021.6, so the cap is load-bearing and
  // the top ~1% of the range is flat. Asserted so it is a known property rather
  // than a surprise the first time two excellent agents tie.
  eq(scoreFromWeightedSum(1), 10000, 'a flawless agent is capped, not 10021');
  eq(scoreFromWeightedSum(0.995), 10000, 'and so is one just below it');
  truthy(scoreFromWeightedSum(0.98) < 10000, 'but the flattening starts near the very top, not early');
});

check('EVERY TIER IS NOW REACHABLE, and at what cost', () => {
  // The distribution is a consequence of the log curve's steepness, not of the
  // multiplier, and it is recorded because it decides spending limits: Platinum
  // carries 500,000 USDC/day and now begins at a weighted sum of ~0.306.
  const at = (ws) => tierForScore(scoreFromWeightedSum(ws));
  eq(at(0.0), 'Bronze', 'nothing earns nothing');
  eq(at(0.03), 'Silver', 'Silver from ~0.022');
  eq(at(0.1), 'Gold', 'Gold from ~0.090');
  eq(at(0.31), 'Platinum', 'Platinum from ~0.306');
  eq(at(1.0), 'Platinum', 'and a flawless agent is Platinum');
  // The floors are the knob if this is wrong — asserted so the docstring and
  // the behaviour cannot drift apart.
  truthy(weightedSumRequiredFor(7500) < 0.31 && weightedSumRequiredFor(7500) > 0.30, 'Platinum floor ~0.306');
});

check('describeCoherence STILL CATCHES an unreachable gate', () => {
  // The check that found the original defect must keep working now that the
  // default configuration is coherent — otherwise raising the multiplier would
  // have quietly disarmed the very thing that caught it.
  const r = describeCoherence(15000);
  eq(r.outcome, 'FAILED', 'a threshold above the ceiling is still incoherent');
  eq(r.ceiling, 10000, 'ceiling reported');
  eq(r.unreachable.map((g) => g.name), ['payment threshold'], 'and only the offending gate is named');
  match(r.detail, /cannot exceed 1\.0/, 'the reason must state why it can never be met');
  // Found by mutation: matching only the explanation left the gate NAMES
  // droppable, and "1 gate is unreachable" is not actionable.
  match(r.detail, /payment threshold at 15000 would need a weighted sum of/, 'named with its floor and requirement');
});

check('COHERENCE SAYS WHICH GATES IT CHECKED, not only which failed', () => {
  // Once the multiplier was raised, every tier floor sat below the ceiling, so
  // dropping the floors from the gate list changed no outcome and survived
  // mutation. A report that lists only failures cannot distinguish "checked and
  // fine" from "never looked" — the three-outcome rule, applied to a report.
  const r = describeCoherence(5000);
  eq(r.gatesConsidered.map((g) => g.name).sort(),
     ['payment threshold', 'tier Gold', 'tier Platinum', 'tier Silver'],
     'every tier floor and the payment threshold must be compared');
  eq(r.gatesConsidered.find((g) => g.name === 'tier Platinum').floor, 7500, 'with its floor');
});

check('the DEFAULT configuration reports VERIFIED', () => {
  // The state raising the multiplier produced, asserted directly rather than
  // inferred from the absence of a failure.
  const r = describeCoherence(5000);
  eq(r.outcome, 'VERIFIED', 'every gate is reachable');
  eq(r.unreachable.length, 0, 'nothing is unreachable');
  match(r.detail, /every gate is reachable/, 'and it says so');
});


check('A NON-FINITE WEIGHTED SUM SCORES ZERO, not the maximum', () => {
  // Found by mutation, then DELETED BY ACCIDENT when a line-range replacement
  // re-pinned the coherence tests around it, and found again by the same
  // mutation on the next run. Restored here — a NaN weighted sum scoring a
  // perfect 10000 would clear every gate, which is the failure this whole file
  // is about, and it is now reachable in a way it was not at multiplier 2000.
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
  for (const score of [1000, 2500, 7500]) {
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

check('THE DENIAL WORDING IS A CONTRACT, not prose', () => {
  // These strings land in a compliance receipt's denialReason and are matched
  // over HTTP by scripts/e2e/run-e2e.mjs. Rewording one to read better is what
  // broke CI on this very change: `npm run check` was 52 VERIFIED while
  // `npm run test:e2e` — a separate step — went red. The regexes below are the
  // e2e's own, duplicated here so the break shows up in the fast suite too.
  match(checkPerTxLimit(5000, 100).detail, /exceeds per-tx limit/i, 'e2e run-e2e.mjs:356 matches this');
  match(checkDailyLimit(900, 900, 1000).detail, /daily limit would be exceeded/i, 'the daily counterpart');
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
