#!/usr/bin/env node
// scripts/checker-assignment-test.mjs — the examinee may not pick the judge.
//
// Run: node scripts/checker-assignment-test.mjs
//
// The assertions are about the properties an auditor would actually attack:
//
//   * 'THE DOER IS NEVER DRAWN' — over every beacon, not on average.
//   * 'THE DOER CANNOT GRIND' — vary the commitment 200 times against a FIXED
//     beacon and the doer still cannot steer, because it must commit before the
//     beacon exists; and vary the beacon and the draw moves regardless of what
//     the doer chose.
//   * 'THE DRAW IS UNIFORM' — the spread is measured. Note what that does NOT
//     cover: rejection sampling is NOT verified here, because at n=5 over 32
//     bits the modulo tilt is ~2e-10 and no sample size we would run can see
//     it. Swapping it for plain modulo leaves this suite green.
//   * 'A SWAPPED PANEL IS CAUGHT' — changing the pool after the draw is how a
//     shopped checker is dressed up as an assigned one.
//   * 'CANDIDATE ORDER CANNOT BIAS' — the pool is canonically sorted, so the
//     party that submits the roster cannot steer by ordering it.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.checker-assign-check-'));
let ca;
try {
  execFileSync(
    localTsc(),
    [
      'lib/trustshell/identity/checker-assignment.ts',
      '--outDir', outDir,
      // Pinned — see work-contract-test.mjs. Seventh occurrence of the hazard.
      '--rootDir', 'lib',
      '--module', 'commonjs',
      '--target', 'es2022',
      '--lib', 'es2022,dom',
      '--moduleResolution', 'node',
      '--esModuleInterop',
      '--strict',
    ],
    { stdio: 'pipe' }
  );
  ca = await import(pathToFileURL(join(outDir, 'trustshell', 'identity', 'checker-assignment.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('checker-assignment compilation failed\n');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}

const {
  commitAssignmentRequest, eligiblePool, commitPool, assignChecker, verifyAssignment,
  MIN_MEANINGFUL_POOL, ASSIGNMENT_DOMAIN,
} = ca;

let passed = 0;
const failures = [];
const check = async (name, fn) => {
  try { await fn(); passed += 1; } catch (e) { failures.push(`${name}\n    ${e.message}`); }
};
const eq = (a, b, what) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  }
};
const truthy = (v, what) => { if (!v) throw new Error(`${what}: expected truthy, got ${JSON.stringify(v)}`); };
const match = (s, re, what) => { if (!re.test(String(s))) throw new Error(`${what}: ${JSON.stringify(String(s))} !~ ${re}`); };
const throws = async (fn, re, what) => {
  try { await fn(); } catch (e) { if (re.test(e.message)) return; throw new Error(`${what}: threw ${JSON.stringify(e.message)}, wanted ${re}`); }
  throw new Error(`${what}: did not throw`);
};

// ── fixtures ────────────────────────────────────────────────────────────────

const DOER = 'did:key:zDOER';
const cand = (n, tier, badges = []) => ({ did: `did:key:z${n}`, qualification: { tier, badges } });

const CANDIDATES = [
  cand('alice', 3, ['security-audit']),
  cand('bob', 3, ['security-audit']),
  cand('carol', 3, ['security-audit']),
  cand('dave', 3, ['security-audit']),
  cand('erin', 3, ['security-audit']),
  { did: DOER, qualification: { tier: 5, badges: ['security-audit'] } }, // the doer, highly qualified
  cand('frank', 1, ['security-audit']),          // under-tier
  cand('grace', 3, []),                          // no badge
];

const REQUIREMENT = { minTier: 2, requiredBadges: ['security-audit'] };

const makeRequest = (over = {}) =>
  commitAssignmentRequest({
    taskId: 'task-1',
    doerDid: DOER,
    criteriaHash: 'sha256:criteria',
    requirement: REQUIREMENT,
    nonce: 'n1',
    ...over,
  });

const POOL = eligiblePool({ candidates: CANDIDATES, requirement: REQUIREMENT, doerDid: DOER }).pool;

// ── eligibility ─────────────────────────────────────────────────────────────

await check('THE DOER IS EXCLUDED BEFORE THE DRAW, however qualified', async () => {
  // The doer here is tier 5 with the badge — the best candidate on paper, and
  // still ineligible. Filtering after the draw would skew toward whoever
  // follows it in the ordering.
  const { pool, excluded } = eligiblePool({ candidates: CANDIDATES, requirement: REQUIREMENT, doerDid: DOER });
  eq(pool.some((c) => c.did === DOER), false, 'the doer must not be in the pool');
  truthy(excluded.some((e) => e.did === DOER && /is the doer/.test(e.reason)), 'and the reason must be recorded');
});

await check('qualification filters by tier and by badge, with reasons', async () => {
  const { pool, excluded } = eligiblePool({ candidates: CANDIDATES, requirement: REQUIREMENT, doerDid: DOER });
  eq(pool.length, 5, 'five qualified candidates remain');
  truthy(excluded.some((e) => /below the required/.test(e.reason)), 'under-tier must be named');
  truthy(excluded.some((e) => /lacks security-audit/.test(e.reason)), 'a missing badge must be named');
});

await check('CANDIDATE ORDER CANNOT BIAS THE DRAW', async () => {
  // Whoever submits the roster must not be able to steer by ordering it.
  const shuffled = [...CANDIDATES].reverse();
  const a = eligiblePool({ candidates: CANDIDATES, requirement: REQUIREMENT, doerDid: DOER }).pool;
  const b = eligiblePool({ candidates: shuffled, requirement: REQUIREMENT, doerDid: DOER }).pool;
  eq(a.map((c) => c.did), b.map((c) => c.did), 'the canonical order must be identical');
  eq(await commitPool(a), await commitPool(b), 'and so must the pool commitment');
});

// ── the draw ────────────────────────────────────────────────────────────────

await check('the draw is deterministic and reproduces for a third party', async () => {
  const rc = await makeRequest();
  const proof = await assignChecker({ requestCommitment: rc, beacon: 'drand:round:1000', pool: POOL });
  const again = await assignChecker({ requestCommitment: rc, beacon: 'drand:round:1000', pool: POOL });
  eq(proof.checkerDid, again.checkerDid, 'the same inputs must give the same checker');

  const v = await verifyAssignment({ proof, pool: POOL });
  eq(v.outcome, 'VERIFIED', 'and an outside party must be able to recheck it');
  eq(v.drawReproduced, true, 'by recomputing the draw');
});

await check('THE ASSIGNER CANNOT RE-DRAW FOR A BETTER ANSWER', async () => {
  // Nothing is free in the seed, so running it again is not a new lottery.
  const rc = await makeRequest();
  const seen = new Set();
  for (let i = 0; i < 20; i += 1) {
    const p = await assignChecker({ requestCommitment: rc, beacon: 'drand:round:1000', pool: POOL });
    seen.add(p.checkerDid);
  }
  eq(seen.size, 1, 're-running must return the same checker forever');
});

await check('THE DOER CANNOT GRIND ITS COMMITMENT AGAINST AN UNKNOWN BEACON', async () => {
  // The doer may vary anything it controls — but it must commit before the
  // beacon exists, so it is choosing blind. Here: 200 different commitments,
  // and the checker it lands on is uncorrelated with its choice, spreading
  // across the whole panel rather than concentrating on a favourite.
  const landed = new Map();
  for (let i = 0; i < 200; i += 1) {
    const rc = await makeRequest({ nonce: `grind-${i}` });
    const p = await assignChecker({ requestCommitment: rc, beacon: 'drand:round:7777', pool: POOL });
    landed.set(p.checkerDid, (landed.get(p.checkerDid) ?? 0) + 1);
  }
  eq(landed.size, POOL.length, 'grinding must reach every candidate, not concentrate on one');
  const worst = Math.max(...landed.values());
  truthy(worst < 200 * 0.5, `no candidate may dominate grinding attempts (worst ${worst}/200)`);
});

await check('a new beacon moves the draw', async () => {
  const rc = await makeRequest();
  const seen = new Set();
  for (let i = 0; i < 40; i += 1) {
    const p = await assignChecker({ requestCommitment: rc, beacon: `drand:round:${i}`, pool: POOL });
    seen.add(p.checkerDid);
  }
  truthy(seen.size > 1, 'a fixed request under different beacons must not be a fixed checker');
});

await check('THE DRAW IS UNIFORM — measured, because modulo bias looks like working code', async () => {
  // WHAT THIS DOES AND DOES NOT PROVE. It checks the draw spreads across the
  // panel rather than favouring a few — a real property, and one a broken seed
  // or a truncated hash would break. It does NOT prove rejection sampling
  // works: swapping it for plain modulo leaves this suite green, because at
  // n=5 over 32 bits the modulo tilt is ~2e-10 and 1000 samples cannot see it
  // [mutation-tested 2026-08-15]. That defence is verified by reading the
  // module, not by this test, and the module says so.
  const counts = new Map(POOL.map((c) => [c.did, 0]));
  const N = 1000;
  for (let i = 0; i < N; i += 1) {
    const rc = await makeRequest({ nonce: `u-${i}` });
    const p = await assignChecker({ requestCommitment: rc, beacon: 'drand:round:42', pool: POOL });
    counts.set(p.checkerDid, counts.get(p.checkerDid) + 1);
  }
  const expected = N / POOL.length;
  for (const [did, n] of counts) {
    // Generous band: this is a fairness smoke test, not a chi-square. A real
    // tilt from modulo bias on a 5-panel is far larger than 40%.
    truthy(n > expected * 0.6 && n < expected * 1.4, `${did} drew ${n}, expected ~${expected}`);
  }
});

// ── refusals ────────────────────────────────────────────────────────────────

await check('AN EMPTY BEACON IS REFUSED — it is the grinding attack', async () => {
  const rc = await makeRequest();
  await throws(
    () => assignChecker({ requestCommitment: rc, beacon: '   ', pool: POOL }),
    /empty beacon|grind/,
    'without public randomness the doer picks its own seed'
  );
});

await check(`a pool below ${MIN_MEANINGFUL_POOL} is refused`, async () => {
  const rc = await makeRequest();
  await throws(
    () => assignChecker({ requestCommitment: rc, beacon: 'b', pool: POOL.slice(0, 1) }),
    /pool of 1|lottery/,
    'a draw from one candidate is a named checker, and calling it random would be false'
  );
});

// ── attacks on the proof ────────────────────────────────────────────────────

await check('A SWAPPED PANEL IS CAUGHT', async () => {
  // Draw from the real panel, then present a friendlier one.
  const rc = await makeRequest();
  const proof = await assignChecker({ requestCommitment: rc, beacon: 'drand:round:1000', pool: POOL });
  const friendly = [...POOL.slice(0, 4), cand('mallory', 3, ['security-audit'])];

  const v = await verifyAssignment({ proof, pool: friendly });
  eq(v.outcome, 'FAILED', 'a changed panel must fail');
  eq(v.poolMatches, false, 'and be reported as a pool mismatch');
});

await check('a forged checkerDid is caught', async () => {
  const rc = await makeRequest();
  const proof = await assignChecker({ requestCommitment: rc, beacon: 'drand:round:1000', pool: POOL });
  const forged = { ...proof, checkerDid: POOL.find((c) => c.did !== proof.checkerDid).did };

  const v = await verifyAssignment({ proof: forged, pool: POOL });
  eq(v.outcome, 'FAILED', 'naming a different checker must fail');
  match(v.detail, /does not reproduce/, 'and say the draw does not reproduce');
});

await check('a swapped beacon is caught', async () => {
  const rc = await makeRequest();
  const proof = await assignChecker({ requestCommitment: rc, beacon: 'drand:round:1000', pool: POOL });
  const v = await verifyAssignment({ proof: { ...proof, beacon: 'drand:round:9999' }, pool: POOL });
  eq(v.outcome, 'FAILED', 'the beacon is part of the seed and cannot be restated');
});

await check('an unknown version is NOT_CHECKED, not FAILED', async () => {
  const rc = await makeRequest();
  const proof = await assignChecker({ requestCommitment: rc, beacon: 'b1', pool: POOL });
  const v = await verifyAssignment({ proof: { ...proof, version: 'zkrepid:checker-assignment:v99' }, pool: POOL });
  eq(v.outcome, 'NOT_CHECKED', 'a format we cannot read is not a forgery we detected');
});

await check('the honest limit is stated in the detail, not hidden', async () => {
  // A reproducible draw over an attacker-chosen beacon verifies and means
  // nothing. If this module ever stops saying so, it is overclaiming.
  const rc = await makeRequest();
  const proof = await assignChecker({ requestCommitment: rc, beacon: 'i-picked-this', pool: POOL });
  const v = await verifyAssignment({ proof, pool: POOL });
  eq(v.outcome, 'VERIFIED', 'the draw does reproduce');
  match(v.detail, /beacon itself was unpredictable is NOT CHECKED/, 'and the limit must be said out loud');
});

rmSync(outDir, { recursive: true, force: true });

console.log(`\nchecker-assignment: ${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}
console.log('All checker-assignment checks passed.');
