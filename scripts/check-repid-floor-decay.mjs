#!/usr/bin/env node
// scripts/check-repid-floor-decay.mjs — the three invariants of
// decay-unless-re-earned.
//
// Run: node scripts/check-repid-floor-decay.mjs
// Exit: 0 VERIFIED · 2 NOT_CHECKED · anything else FAILED
//
// The module is DESIGN, not deployment: nothing calls it, no trigger changes,
// nothing writes. What this suite pins is the part of the design that is
// decidable without a population — the invariants — so that when a rate is
// finally chosen, the shape it plugs into is already checked.
//
// The three that matter, and each has a mutation:
//
//   1. decay moves the FLOOR, never the SCORE — the decision type has no field
//      that could carry a score, and `decays` reports from/to floors only.
//   2. it steps by TIER, never continuously.
//   3. it never falls below the level currently demonstrated.
//
// Plus the refusal: `staleAfterMs` is required, because it cannot be calibrated
// from a fleet whose ratchet binds exactly one real agent.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';
import { createChecker } from './lib/harness-compile.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.floor-decay-check-'));
let M;
try {
  execFileSync(
    localTsc(),
    ['lib/trustshell/repid-floor-decay.ts', '--outDir', outDir, '--rootDir', 'lib',
     '--module', 'commonjs', '--target', 'es2022', '--lib', 'es2022,dom',
     '--moduleResolution', 'node', '--esModuleInterop', '--strict'],
    { stdio: 'pipe' }
  );
  M = await import(pathToFileURL(join(outDir, 'trustshell', 'repid-floor-decay.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('repid-floor-decay compilation failed\n');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}
rmSync(outDir, { recursive: true, force: true });

const { decideFloor, dbTierFloorFor, nextFloorBelow, DB_TIER_FLOORS } = M;
const { check, eq, truthy, report } = createChecker('repid-floor-decay');

const DAY = 86_400_000;
const CFG = { staleAfterMs: 30 * DAY, maxStepsPerEvaluation: 1 };
const at = (peak, current, floor, lastReEarnedAt) => ({
  peakRepid: peak, currentRepid: current, floor, lastReEarnedAt,
});

// ── the ladder this module uses ─────────────────────────────────────────────

check('it uses the DATABASE ladder, not the TIER_LIMITS one', () => {
  // #81 measured two ladders alive at once, agreeing on exactly one boundary.
  // Using 7500/2500 here would decay agents to floors the ratchet never sets.
  eq(DB_TIER_FLOORS.map((t) => t.floor).join(','), '8000,5000,1000,500,0', 'the DB floors');
  eq(dbTierFloorFor(8000), 8000, 'VETERAN is inclusive');
  eq(dbTierFloorFor(7999), 5000, 'just below VETERAN is AUTONOMOUS, not Platinum/Gold');
  eq(dbTierFloorFor(2500), 1000, '2500 is a TIER_LIMITS boundary and means nothing here');
});

check('nextFloorBelow steps one tier and bottoms out at 0', () => {
  eq(nextFloorBelow(8000), 5000, 'VETERAN -> AUTONOMOUS');
  eq(nextFloorBelow(5000), 1000, 'AUTONOMOUS -> ESTABLISHED');
  eq(nextFloorBelow(1000), 500, 'ESTABLISHED -> EARNING');
  eq(nextFloorBelow(500), 0, 'EARNING -> PROBATIONARY');
  eq(nextFloorBelow(0), 0, 'never negative');
});

// ── the refusal ─────────────────────────────────────────────────────────────

check('staleAfterMs is REQUIRED — no default window exists', () => {
  // Fails if a default is ever introduced. The window cannot be calibrated from
  // a fleet whose ratchet binds one real agent by 35 points.
  for (const bad of [undefined, null, 0, -1, NaN, Infinity, '30d']) {
    let threw = false;
    try {
      decideFloor(at(8000, 100, 8000, 0), 10 * DAY, { staleAfterMs: bad, maxStepsPerEvaluation: 1 });
    } catch {
      threw = true;
    }
    eq(threw, true, `staleAfterMs=${JSON.stringify(bad)} must throw`);
  }
});

check('maxStepsPerEvaluation must be an integer >= 1', () => {
  for (const bad of [0, -1, 1.5, NaN]) {
    let threw = false;
    try {
      decideFloor(at(8000, 100, 8000, 0), 10 * DAY, { staleAfterMs: DAY, maxStepsPerEvaluation: bad });
    } catch {
      threw = true;
    }
    eq(threw, true, `maxStepsPerEvaluation=${JSON.stringify(bad)} must throw`);
  }
});

// ── INVARIANT 1: the floor moves, the score never does ──────────────────────

check('a decay decision carries FLOORS only — it cannot express a score change', () => {
  const d = decideFloor(at(8000, 100, 8000, 0), 400 * DAY, CFG);
  eq(d.kind, 'decays', 'it decays');
  eq(d.from, 8000, 'from floor');
  eq(d.to, 5000, 'to floor');
  // The load-bearing absence. A field here would let a caller "apply" a decay by
  // editing current_repid, manufacturing reputation movement no event explains.
  truthy(!('currentRepid' in d) && !('score' in d) && !('newScore' in d),
    'the decision must have no score-shaped field at all');
  truthy(typeof d.reason === 'string' && d.reason.includes('score is unchanged'),
    'and it says so in the reason that lands in an audit trail');
});

// ── INVARIANT 2: steps by tier ──────────────────────────────────────────────

check('decay lands exactly on a tier floor, never between', () => {
  const floors = new Set(DB_TIER_FLOORS.map((t) => t.floor));
  for (const [peak, floor] of [[8000, 8000], [5200, 5000], [1400, 1000], [600, 500]]) {
    const d = decideFloor(at(peak, 0, floor, 0), 999 * DAY, CFG);
    if (d.kind === 'decays') truthy(floors.has(d.to), `decayed to ${d.to}, which is not a tier floor`);
  }
});

check('one evaluation steps ONE tier, however stale', () => {
  // A year of staleness is still one step. Multi-step requires stating it.
  const d = decideFloor(at(8000, 0, 8000, 0), 3650 * DAY, CFG);
  eq(d.to, 5000, 'ten years of staleness is still one tier');
  const multi = decideFloor(at(8000, 0, 8000, 0), 3650 * DAY, { ...CFG, maxStepsPerEvaluation: 2 });
  eq(multi.to, 1000, 'two steps only when explicitly asked for');
});

// ── INVARIANT 3: never below what is demonstrated now ───────────────────────

check('a score at or above the floor HOLDS it, however stale the timestamp', () => {
  // Asked before the clock. An agent demonstrating the level now is not stale,
  // whatever a timestamp says.
  //
  // THE FIXTURE IS current == peak, NOT current > peak. The ratchet maintains
  // `peak := greatest(peak, current)`, so a score above its own peak cannot
  // occur — and an earlier draft used (peak 8000, current 8200), which is that
  // impossible state. It let `floor-decay-expires-an-active-agent` SURVIVE:
  // the mutant condition `current > peak` happened to be true for it, so the
  // mutated check returned `holds` for the wrong reason and the suite stayed
  // green. A fixture that cannot occur cannot protect an invariant.
  const exactly = decideFloor(at(8000, 8000, 8000, 0), 9999 * DAY, CFG);
  eq(exactly.kind, 'holds', 'an agent exactly at its floor holds it');
  truthy(exactly.reason.includes('demonstrated now'), 'and the reason says why');

  const above = decideFloor(at(8200, 8200, 8000, 0), 9999 * DAY, CFG);
  eq(above.kind, 'holds', 'an agent above its floor holds it');
});

check('decay stops at the demonstrated level, not below it', () => {
  // Peak 8000, floor 8000, but the agent currently scores 5200 — a real
  // AUTONOMOUS. The floor may fall to 5000 and no further, even multi-step.
  const d = decideFloor(at(8000, 5200, 8000, 0), 999 * DAY, { ...CFG, maxStepsPerEvaluation: 5 });
  eq(d.kind, 'decays', 'it decays');
  eq(d.to, 5000, 'stops at the tier the agent currently occupies');
  truthy(d.to <= dbTierFloorFor(5200) || d.to === dbTierFloorFor(5200),
    'never below the demonstrated tier floor');
});

check('a floor already at the bottom holds', () => {
  eq(decideFloor(at(0, 0, 0, 0), 999 * DAY, CFG).kind, 'holds', 'nothing below PROBATIONARY');
});

// ── three outcomes, and NOT_CHECKED is the common one ───────────────────────

check('an absent last-demonstration is NOT_CHECKED, never a decay', () => {
  // The single most likely production input: most rows have no such timestamp.
  // Decaying on it would expire floors for want of a column nobody wrote.
  const d = decideFloor(at(8000, 100, 8000, null), 999 * DAY, CFG);
  eq(d.kind, 'not_checked', 'unknown age must not decay');
  eq(d.floor, 8000, 'and the floor is reported unchanged');
  truthy(d.reason.includes('UNKNOWN'), 'and it says the age is unknown');
});

check('an absent last-demonstration is not silently treated as sound either', () => {
  // The other half. `holds` would report a floor as examined-and-fine when it
  // was never examined — the two-outcome mistake in the reassuring direction.
  eq(decideFloor(at(8000, 100, 8000, null), 999 * DAY, CFG).kind !== 'holds', true, 'not holds');
});

check('a future last-demonstration is NOT_CHECKED — the clock is unusable', () => {
  const d = decideFloor(at(8000, 100, 8000, 500 * DAY), 10 * DAY, CFG);
  eq(d.kind, 'not_checked', 'negative age');
});

check('a non-finite input is NOT_CHECKED, never a decay', () => {
  for (const s of [at(NaN, 100, 8000, 0), at(8000, NaN, 8000, 0), at(8000, 100, NaN, 0)]) {
    eq(decideFloor(s, 999 * DAY, CFG).kind, 'not_checked', 'garbage in, NOT_CHECKED out');
  }
});

check('inside the window it holds, outside it decays — the boundary is exact', () => {
  const justInside = decideFloor(at(8000, 100, 8000, 0), 30 * DAY - 1, CFG);
  eq(justInside.kind, 'holds', '1ms inside the window');
  const exactly = decideFloor(at(8000, 100, 8000, 0), 30 * DAY, CFG);
  eq(exactly.kind, 'decays', 'exactly at the window is stale — inclusive, like every other threshold here');
});

report();
