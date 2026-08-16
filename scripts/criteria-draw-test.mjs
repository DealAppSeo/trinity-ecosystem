#!/usr/bin/env node
// scripts/criteria-draw-test.mjs — the examinee may not pick the test.
//
// Run: node scripts/criteria-draw-test.mjs
//
//   * 'THE DOER CANNOT GRIND THE EXAM' — vary the commitment, and which
//     criteria come up is uncorrelated with the choice.
//   * 'EVERY SUBSET IS REACHABLE' — partial Fisher-Yates, so no criterion is
//     unreachable and none is over-drawn. A capped-retry implementation would
//     starve the tail of the bank.
//   * 'NO DUPLICATES' — drawing without replacement, checked directly rather
//     than inferred from the algorithm's name.
//   * 'AN EDITED SYLLABUS IS CAUGHT' — including a lowered `minScore`, which is
//     the field a doer most wants moved.
//   * 'DRAWING THE WHOLE BANK IS REFUSED' — it is not a draw, and calling it
//     one would overstate what happened.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.criteria-draw-check-'));
let cd, ca;
try {
  execFileSync(
    localTsc(),
    [
      'lib/trustshell/identity/checker-assignment.ts',
      'lib/trustshell/identity/criteria-draw.ts',
      '--outDir', outDir,
      // Pinned — see work-contract-test.mjs. Eighth occurrence of the hazard.
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
  const base = join(outDir, 'trustshell', 'identity');
  ca = await import(pathToFileURL(join(base, 'checker-assignment.js')).href);
  cd = await import(pathToFileURL(join(base, 'criteria-draw.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('criteria-draw compilation failed\n');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}

const { commitAssignmentRequest } = ca;
const { commitBank, drawCriteria, verifyDraw, CRITERIA_DRAW_DOMAIN } = cd;

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

const BANK = Array.from({ length: 12 }, (_, i) => ({
  id: `c${i}`,
  statement: `criterion ${i} holds`,
  minScore: i % 3 === 0 ? 0.9 : undefined,
}));

const REQUIREMENT = { minTier: 2, requiredBadges: [] };
const makeRequest = (nonce = 'n1') =>
  commitAssignmentRequest({
    taskId: 'task-1',
    doerDid: 'did:key:zDOER',
    criteriaHash: 'sha256:bank',
    requirement: REQUIREMENT,
    nonce,
  });

const BEACON = 'drand:round:1000';

// ── the draw ────────────────────────────────────────────────────────────────

await check('the draw is deterministic and reproduces for a third party', async () => {
  const rc = await makeRequest();
  const a = await drawCriteria({ requestCommitment: rc, beacon: BEACON, bank: BANK, count: 4 });
  const b = await drawCriteria({ requestCommitment: rc, beacon: BEACON, bank: BANK, count: 4 });
  eq(a.indices, b.indices, 'the same inputs must give the same exam');

  const v = await verifyDraw({ proof: a, bank: BANK });
  eq(v.outcome, 'VERIFIED', 'and an outside party must be able to recheck it');
});

await check('NO DUPLICATES — the draw is without replacement', async () => {
  for (let i = 0; i < 50; i += 1) {
    const rc = await makeRequest(`dup-${i}`);
    const p = await drawCriteria({ requestCommitment: rc, beacon: BEACON, bank: BANK, count: 5 });
    eq(new Set(p.indices).size, 5, 'a repeated criterion would mean a shorter exam than agreed');
    eq(p.criteria.length, 5, 'and the criteria must match the count');
  }
});

await check('EVERY CRITERION IS REACHABLE — no starved tail', async () => {
  // A capped-retry implementation of "without replacement" starves the end of
  // the bank. Partial Fisher-Yates cannot.
  const seen = new Set();
  for (let i = 0; i < 300; i += 1) {
    const rc = await makeRequest(`reach-${i}`);
    const p = await drawCriteria({ requestCommitment: rc, beacon: BEACON, bank: BANK, count: 3 });
    for (const idx of p.indices) seen.add(idx);
  }
  eq(seen.size, BANK.length, 'every criterion in the bank must be drawable');
});

await check('THE DOER CANNOT GRIND THE EXAM', async () => {
  // 200 different commitments against a beacon it did not know: the exam it
  // lands on must not concentrate.
  const counts = new Map();
  for (let i = 0; i < 200; i += 1) {
    const rc = await makeRequest(`grind-${i}`);
    const p = await drawCriteria({ requestCommitment: rc, beacon: 'drand:round:7777', bank: BANK, count: 3 });
    const key = [...p.indices].sort((a, b) => a - b).join(',');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  truthy(counts.size > 100, `grinding must not converge on a few exams (got ${counts.size} distinct)`);
  truthy(Math.max(...counts.values()) < 10, 'and no single exam may dominate');
});

await check('a new beacon moves the exam', async () => {
  const rc = await makeRequest();
  const seen = new Set();
  for (let i = 0; i < 30; i += 1) {
    const p = await drawCriteria({ requestCommitment: rc, beacon: `drand:round:${i}`, bank: BANK, count: 3 });
    seen.add(p.indices.join(','));
  }
  truthy(seen.size > 1, 'a fixed request under different beacons must not be a fixed exam');
});

await check('minScore floors travel with the drawn criteria', async () => {
  const rc = await makeRequest();
  const p = await drawCriteria({ requestCommitment: rc, beacon: BEACON, bank: BANK, count: 6 });
  for (const c of p.criteria) {
    const original = BANK.find((b) => b.id === c.id);
    eq(c.minScore, original.minScore, `the floor for ${c.id} must survive the draw`);
  }
});

// ── refusals ────────────────────────────────────────────────────────────────

await check('AN EMPTY BEACON IS REFUSED', async () => {
  const rc = await makeRequest();
  await throws(
    () => drawCriteria({ requestCommitment: rc, beacon: '  ', bank: BANK, count: 3 }),
    /empty beacon|own exam/,
    'the doer would be choosing its own exam through a seed it controls'
  );
});

await check('DRAWING THE WHOLE BANK IS REFUSED — it is not a draw', async () => {
  const rc = await makeRequest();
  await throws(
    () => drawCriteria({ requestCommitment: rc, beacon: BEACON, bank: BANK, count: BANK.length }),
    /the bank itself|not a draw/,
    'selecting everything and calling it a draw overstates what happened'
  );
});

await check('drawing more than the bank holds is refused', async () => {
  const rc = await makeRequest();
  await throws(
    () => drawCriteria({ requestCommitment: rc, beacon: BEACON, bank: BANK, count: 99 }),
    /from a bank of/,
    'a bank too small must be named, not silently truncated'
  );
});

await check('a zero-criterion exam is refused', async () => {
  const rc = await makeRequest();
  await throws(
    () => drawCriteria({ requestCommitment: rc, beacon: BEACON, bank: BANK, count: 0 }),
    /no agreed bar/,
    'work with no criteria cannot be judged, and an empty exam always passes'
  );
});

// ── attacks ─────────────────────────────────────────────────────────────────

await check('AN EDITED SYLLABUS IS CAUGHT', async () => {
  const rc = await makeRequest();
  const proof = await drawCriteria({ requestCommitment: rc, beacon: BEACON, bank: BANK, count: 4 });
  const edited = BANK.map((c, i) => (i === 0 ? { ...c, statement: 'anything at all' } : c));

  const v = await verifyDraw({ proof, bank: edited });
  eq(v.outcome, 'FAILED', 'an edited bank must fail');
  eq(v.bankMatches, false, 'and be reported as a bank mismatch');
});

await check('A LOWERED FLOOR IS CAUGHT — the field a doer most wants moved', async () => {
  const rc = await makeRequest();
  const proof = await drawCriteria({ requestCommitment: rc, beacon: BEACON, bank: BANK, count: 4 });
  const softened = BANK.map((c) => (c.minScore === undefined ? c : { ...c, minScore: 0.1 }));

  const v = await verifyDraw({ proof, bank: softened });
  eq(v.outcome, 'FAILED', 'the commitment must cover minScore, not just the statement');
});

await check('THE BANK COMMITMENT COVERS minScore IN ITS OWN RIGHT', async () => {
  // Found by mutation testing: dropping minScore from commitBank left the suite
  // green, because the lowered-floor test was rescued downstream by the
  // criteria comparison. The commitment must bind the floor by itself — a bank
  // whose floors can move after commitment was never committed.
  const softened = BANK.map((c) => (c.minScore === undefined ? c : { ...c, minScore: 0.1 }));
  const a = await commitBank(BANK);
  const b = await commitBank(softened);
  truthy(a !== b, 'changing a floor must change the bank commitment');
});

await check('A PROOF WHOSE INDICES CONTRADICT ITS OWN CRITERIA IS CAUGHT', async () => {
  // Also found by mutation: the indices check was redundant, because every
  // forgery so far also changed the criteria. Here the criteria are left
  // exactly as drawn and only the indices are rewritten — internally
  // inconsistent, and only the indices comparison can see it.
  const rc = await makeRequest();
  const proof = await drawCriteria({ requestCommitment: rc, beacon: BEACON, bank: BANK, count: 4 });
  const shuffled = [...proof.indices].reverse();
  truthy(JSON.stringify(shuffled) !== JSON.stringify(proof.indices), 'the fixture must actually differ');

  const v = await verifyDraw({ proof: { ...proof, indices: shuffled }, bank: BANK });
  eq(v.outcome, 'FAILED', 'indices that do not match the criteria must fail');
});

await check('a forged index list is caught', async () => {
  const rc = await makeRequest();
  const proof = await drawCriteria({ requestCommitment: rc, beacon: BEACON, bank: BANK, count: 4 });
  const forged = { ...proof, indices: [0, 1, 2, 3], criteria: [BANK[0], BANK[1], BANK[2], BANK[3]] };

  const v = await verifyDraw({ proof: forged, bank: BANK });
  eq(v.outcome, 'FAILED', 'choosing the easy four must not verify');
  match(v.detail, /does not reproduce/, 'and must say the draw does not reproduce');
});

await check('an unknown version is NOT_CHECKED, not FAILED', async () => {
  const rc = await makeRequest();
  const proof = await drawCriteria({ requestCommitment: rc, beacon: BEACON, bank: BANK, count: 3 });
  const v = await verifyDraw({ proof: { ...proof, version: 'zkrepid:criteria-draw:v99' }, bank: BANK });
  eq(v.outcome, 'NOT_CHECKED', 'a format we cannot read is not a forgery we detected');
});

await check('the honest limit — WHO WROTE THE BANK — is stated, not hidden', async () => {
  const rc = await makeRequest();
  const proof = await drawCriteria({ requestCommitment: rc, beacon: BEACON, bank: BANK, count: 3 });
  const v = await verifyDraw({ proof, bank: BANK });
  eq(v.outcome, 'VERIFIED', 'the draw reproduces');
  match(v.detail, /WHO WROTE THE BANK is NOT CHECKED/, 'and a self-authored bank makes it meaningless');
});

rmSync(outDir, { recursive: true, force: true });

console.log(`\ncriteria-draw: ${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}
console.log('All criteria-draw checks passed.');
