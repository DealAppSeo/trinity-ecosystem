#!/usr/bin/env node
// scripts/check-repid-registry-drift.mjs — does a STORED row agree with the
// ladder that will rewrite it?
//
// Run: node scripts/check-repid-registry-drift.mjs
// Exit: 0 VERIFIED · 2 NOT_CHECKED · anything else FAILED
//
// ── THE GAP THIS FILLS ──────────────────────────────────────────────────────
//
// `check:repid-calibration` proves the ladder SORTS. `check:repid-scoring`
// proves the ladder is INTERNALLY consistent. Both test the ladder in
// isolation, where a stored row cannot contradict it — so neither could see
// that `agent_kya_registry` was written by a ladder that no longer exists.
//
// The live measurement is in `repid-scoring.ts`'s REGISTRY DRIFT header and in
// `docs/REPID-REGISTRY-DRIFT-2026-08-17.md`. Nine of twelve rows disagree, every
// one permissively, and the trigger is a routine `+10` on a successful payment.
//
// ── WHY THE LIVE ROWS ARE FIXTURES HERE, NOT A QUERY ────────────────────────
//
// This suite does NOT reach the database. Two reasons, and the second is the
// one that matters:
//
//   * CI has no Supabase credentials, and a gate that cannot run is a gate that
//     gets ignored — the same argument the calibration suite makes for
//     reporting rather than failing.
//   * A suite that queried live rows would go green the moment somebody
//     UPDATEs them, which is not the same as the defect being fixed. The defect
//     is in the CODE: two readers of one fact, disagreeing. That is what is
//     asserted here, using the live rows as the fixtures that prove the shape
//     is real rather than hypothetical.
//
// So: re-measure the rows with the SQL in the doc; assert the mechanism here.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';
import { createChecker } from './lib/harness-compile.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.repid-drift-check-'));
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
  console.error('repid-registry-drift compilation failed\n');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}
rmSync(outDir, { recursive: true, force: true });

const { describeRegistryDrift, TIER_LIMITS, tierForScore } = m;
const { check, eq, truthy, report } = createChecker('repid-registry-drift');

/**
 * The live rows, 2026-08-17, `agent_kya_registry` (12 of 12).
 *
 * Copied verbatim so the suite fails if the MECHANISM stops flagging them —
 * these are evidence that the shape occurs in production, not a mock of a
 * situation somebody imagined.
 */
const LIVE = [
  { name: 'VERITAS', score: 9200, tier: 'Platinum', daily: 500000 },
  { name: 'SHOFET', score: 8800, tier: 'Platinum', daily: 500000 },
  { name: 'SOPHIA', score: 8650, tier: 'Platinum', daily: 500000 },
  { name: 'ORCH', score: 8100, tier: 'Gold', daily: 100000 },
  { name: 'NEXUS', score: 7900, tier: 'Gold', daily: 100000 },
  { name: 'W3C', score: 7700, tier: 'Gold', daily: 100000 },
  { name: 'TORCH', score: 7600, tier: 'Silver', daily: 10000 },
  { name: 'GCM', score: 7400, tier: 'Silver', daily: 10000 },
  { name: 'HDM', score: 7300, tier: 'Silver', daily: 10000 },
  { name: 'CHESED', score: 7200, tier: 'Silver', daily: 10000 },
  { name: 'MEL', score: 7100, tier: 'Silver', daily: 10000 },
  { name: 'APM', score: 6900, tier: 'Silver', daily: 10000 },
];
const driftOf = (r) => describeRegistryDrift(r.score, r.tier, r.daily);

// ── the mechanism ───────────────────────────────────────────────────────────

check('a row written by the current ladder is VERIFIED', () => {
  const d = describeRegistryDrift(9200, 'Platinum', TIER_LIMITS.Platinum.daily);
  eq(d.outcome, 'VERIFIED', 'agreeing row');
  eq(d.limitMultiplierOnNextWrite, 1, 'the next write changes nothing');
});

check('a row whose TIER disagrees is FAILED', () => {
  // TORCH: 7600 is Platinum on this ladder, stored as Silver.
  const d = describeRegistryDrift(7600, 'Silver', TIER_LIMITS.Platinum.daily);
  eq(d.outcome, 'FAILED', 'tier mismatch alone must fail');
  eq(d.ladderTier, 'Platinum', 'the ladder verdict');
});

check('a row whose LIMIT disagrees is FAILED even when the tier string matches', () => {
  // The row can carry the right WORD and the wrong NUMBER — they are separate
  // columns, and `validate()` enforces the number.
  const d = describeRegistryDrift(9200, 'Platinum', 250000);
  eq(d.outcome, 'FAILED', 'limit mismatch must fail on its own');
  eq(d.limitMultiplierOnNextWrite, 2, 'the next write doubles it');
});

check('the multiplier reports what the NEXT WRITE does to the limit', () => {
  eq(driftOf(LIVE.find((r) => r.name === 'TORCH')).limitMultiplierOnNextWrite, 50, 'TORCH x50');
  eq(driftOf(LIVE.find((r) => r.name === 'ORCH')).limitMultiplierOnNextWrite, 5, 'ORCH x5');
  eq(driftOf(LIVE.find((r) => r.name === 'APM')).limitMultiplierOnNextWrite, 10, 'APM x10');
});

check('penaltyHeadroom is how far the score may FALL before the limit does', () => {
  // The number that makes a penalty legible as a reward. TORCH stores Silver's
  // 10,000, which the ladder grants from 2500 up — so 7600-2500.
  eq(driftOf(LIVE.find((r) => r.name === 'TORCH')).penaltyHeadroom, 5100, 'TORCH');
  eq(driftOf(LIVE.find((r) => r.name === 'ORCH')).penaltyHeadroom, 3100, 'ORCH (Gold floor 5000)');
  eq(driftOf(LIVE.find((r) => r.name === 'VERITAS')).penaltyHeadroom, 1700, 'an AGREEING row still has headroom');
});

check('headroom uses the LOWEST sustaining floor, not the stored tier floor', () => {
  // The subtle one, and the bug I shipped in the first SQL pass: a row storing
  // Silver's 10,000 sustains that limit from the SILVER floor (2500), not from
  // Gold's (5000). Anchoring on the wrong floor understates the headroom by a
  // whole tier — 5,100 reported as 2,600 for TORCH.
  const d = describeRegistryDrift(7600, 'Silver', 10000);
  eq(d.penaltyHeadroom, 5100, 'floor 2500, not 5000');
});

check('a stored limit no tier can sustain reports null headroom, not a negative', () => {
  // Above Platinum's 500,000 nothing sustains it, so there is no answer. A
  // number here would be a fabricated one.
  const d = describeRegistryDrift(9200, 'Platinum', 600000);
  eq(d.penaltyHeadroom, null, 'no sustaining floor');
  eq(d.outcome, 'FAILED', 'and it is still a disagreement');
});

// ── three outcomes, not two ─────────────────────────────────────────────────

check('an unreadable score is NOT_CHECKED, never VERIFIED', () => {
  // `tierForScore` answers Bronze for a non-finite score — correct for a gate,
  // and it would silently "agree" with a row storing Bronze. Reporting VERIFIED
  // there asserts a comparison that never happened.
  for (const bad of [NaN, Infinity, null, undefined, '9200']) {
    eq(describeRegistryDrift(bad, 'Bronze', TIER_LIMITS.Bronze.daily).outcome,
      'NOT_CHECKED', `score ${JSON.stringify(bad)}`);
  }
});

check('an unreadable stored limit is NOT_CHECKED', () => {
  for (const bad of [NaN, null, undefined, -1, 'lots']) {
    eq(describeRegistryDrift(9200, 'Platinum', bad).outcome, 'NOT_CHECKED', `limit ${JSON.stringify(bad)}`);
  }
});

check('a NOT_CHECKED verdict never carries a fabricated multiplier or headroom', () => {
  const d = describeRegistryDrift(NaN, 'Bronze', 1000);
  eq(d.limitMultiplierOnNextWrite, null, 'multiplier');
  eq(d.penaltyHeadroom, null, 'headroom');
  eq(d.storedDaily, null, 'and it does not echo a limit it did not use');
});

// ── the live rows, as evidence the shape is real ────────────────────────────

check('9 of the 12 live rows disagree with the ladder', () => {
  const failing = LIVE.filter((r) => driftOf(r).outcome === 'FAILED');
  eq(failing.length, 9, 'disagreeing rows');
  eq(failing.map((r) => r.name).sort().join(','),
    'APM,CHESED,GCM,HDM,MEL,NEXUS,ORCH,TORCH,W3C', 'which ones');
});

check('every live disagreement is PERMISSIVE — the ladder always grants more', () => {
  // The direction is the finding. A restrictive drift would be a smaller
  // problem: an agent under-authorized until someone notices. Permissive drift
  // hands out spending power for making a payment.
  for (const r of LIVE) {
    const d = driftOf(r);
    truthy(d.ladderDaily >= d.storedDaily,
      `${r.name}: ladder ${d.ladderDaily} must not be below stored ${d.storedDaily}`);
  }
  truthy(LIVE.some((r) => driftOf(r).ladderDaily > driftOf(r).storedDaily),
    'and at least one is strictly greater, or this asserts nothing');
});

check('the three AGREEING rows are the Platinum ones', () => {
  const ok = LIVE.filter((r) => driftOf(r).outcome === 'VERIFIED').map((r) => r.name).sort();
  eq(ok.join(','), 'SHOFET,SOPHIA,VERITAS', 'agreeing rows');
});

check('positive headroom IS the penalty-raises-the-limit condition', () => {
  // `updateRepID` takes a SIGNED delta and rewrites the limit from the ladder,
  // so wherever headroom is positive a PENALTY still leaves the agent with at
  // least today's limit. Asserted as an equivalence on the detector rather than
  // as "the live rows are still broken" — a suite that fails once the drift is
  // repaired would be asserting the presence of the bug.
  const drifted = describeRegistryDrift(7600, 'Silver', 10000);   // TORCH's shape
  truthy(drifted.penaltyHeadroom > 0, 'the drifted row has room to fall');
  eq(TIER_LIMITS[tierForScore(7600 - 100)].daily > 10000, true,
    'and a -100 delta lands a tier whose limit is above the stored one');

  const agreeing = describeRegistryDrift(9200, 'Platinum', TIER_LIMITS.Platinum.daily);
  eq(agreeing.outcome, 'VERIFIED', 'an agreeing row');
  eq(TIER_LIMITS[tierForScore(9200 - 100)].daily > TIER_LIMITS.Platinum.daily, false,
    'cannot be pushed above its own limit by a penalty');
});

report();
