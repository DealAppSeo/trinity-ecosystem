#!/usr/bin/env node
// scripts/assigned-contract-test.mjs — a contract the doer signs but did not compose.
//
// Run: node scripts/assigned-contract-test.mjs
//
//   * 'THE PAYLOAD IS UNCHANGED' — the whole point. An assembled contract goes
//     through proposeContract/countersignContract untouched and verifies, so
//     this fix needs no interop change and no cross-lane decision.
//   * 'A PROOF STAPLED TO A DIFFERENT CONTRACT IS CAUGHT' — the attack a reader
//     is most likely to skip, because both proofs verify on their own.
//   * 'ONE COMMITMENT, ONE BEACON' — re-rolling one draw and keeping the other
//     must fail.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.assigned-contract-check-'));
let did, wc, ca, cd, ac;
try {
  execFileSync(
    localTsc(),
    [
      'lib/trustshell/identity/did.ts',
      'lib/trustshell/identity/work-contract.ts',
      'lib/trustshell/identity/checker-assignment.ts',
      'lib/trustshell/identity/criteria-draw.ts',
      'lib/trustshell/identity/assigned-contract.ts',
      '--outDir', outDir,
      // Pinned — see work-contract-test.mjs. Ninth occurrence of the hazard.
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
  did = await import(pathToFileURL(join(base, 'did.js')).href);
  wc = await import(pathToFileURL(join(base, 'work-contract.js')).href);
  ca = await import(pathToFileURL(join(base, 'checker-assignment.js')).href);
  cd = await import(pathToFileURL(join(base, 'criteria-draw.js')).href);
  ac = await import(pathToFileURL(join(base, 'assigned-contract.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('assigned-contract compilation failed\n');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}

const { generateKeyPair } = did;
const { proposeContract, countersignContract, verifyContract } = wc;
const { eligiblePool } = ca;
const { assembleAssignedContract, verifyAssignedContract } = ac;

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

// ── fixtures ────────────────────────────────────────────────────────────────

const doer = await generateKeyPair();
const checkers = await Promise.all([0, 1, 2, 3, 4].map(() => generateKeyPair()));

// The doer is deliberately IN the candidate list, and highly qualified. An
// earlier fixture left it out, which made the doer-exclusion a no-op that
// mutation testing caught: removing the exclusion left the suite green.
const CANDIDATES = [
  ...checkers.map((k) => ({ did: k.did, qualification: { tier: 3, badges: ['security-audit'] } })),
  { did: doer.did, qualification: { tier: 5, badges: ['security-audit'] } },
];
const REQUIREMENT = { minTier: 2, requiredBadges: ['security-audit'] };
const BANK = Array.from({ length: 10 }, (_, i) => ({
  id: `c${i}`,
  statement: `criterion ${i} holds`,
  minScore: i % 2 === 0 ? 0.9 : undefined,
}));
const BEACON = 'drand:round:1000';

const POOL = eligiblePool({ candidates: CANDIDATES, requirement: REQUIREMENT, doerDid: doer.did }).pool;

const assemble = (over = {}) =>
  assembleAssignedContract({
    taskId: 'task-1',
    doerDid: doer.did,
    deliverable: 'a working thing',
    requirement: REQUIREMENT,
    nonce: 'n1',
    beacon: BEACON,
    candidates: CANDIDATES,
    bank: BANK,
    criteriaCount: 3,
    proposedAt: '2026-08-15T00:00:00.000Z',
    ...over,
  });

// ── the composition ─────────────────────────────────────────────────────────

await check('THE DOER SIGNS A CONTRACT IT DID NOT COMPOSE', async () => {
  const a = await assemble();
  const v = await verifyAssignedContract({
    unsigned: a.unsigned, assignment: a.assignment, criteriaProof: a.criteriaProof,
    pool: POOL, bank: BANK,
  });
  eq(v.outcome, 'VERIFIED', 'the contract must match both draws');
  eq(v.checkerWasDrawn, true, 'the checker was drawn, not chosen');
  eq(v.criteriaWereDrawn, true, 'and so was the exam');
  truthy(POOL.some((c) => c.did === a.unsigned.checkerDid), 'the checker must come from the pool');
  eq(a.unsigned.criteria.length, 3, 'three criteria drawn from ten');
});

await check('THE PAYLOAD IS UNCHANGED — it signs and verifies like any contract', async () => {
  // The entire argument for this approach: no interop change, no cross-lane
  // decision. If an assembled contract could not go through the existing
  // signing path untouched, the fix would cost a payload change after all.
  const a = await assemble();
  const checkerKey = checkers.find((k) => k.did === a.unsigned.checkerDid);
  truthy(checkerKey, 'the drawn checker must be one we hold a key for');

  const { doerSignature } = await proposeContract({ unsigned: a.unsigned, doerKey: doer.privateKey });
  const contract = await countersignContract({
    unsigned: a.unsigned, doerSignature, checkerKey: checkerKey.privateKey,
  });
  const v = await verifyContract(contract);
  eq(v.outcome, 'VERIFIED', 'an assembled contract must verify unchanged');
  eq(v.independent, true, 'and the checker is not the doer');
});

await check('the doer is never drawn as its own checker, across many beacons', async () => {
  for (let i = 0; i < 40; i += 1) {
    const a = await assemble({ beacon: `drand:round:${i}` });
    truthy(a.unsigned.checkerDid !== doer.did, 'the doer must never judge itself');
  }
});

await check('minScore floors reach the contract intact', async () => {
  const a = await assemble();
  for (const c of a.unsigned.criteria) {
    const original = BANK.find((b) => b.id === c.id);
    eq(c.minScore, original.minScore, `the floor for ${c.id} must survive assembly`);
  }
});

await check('THE REQUEST COMMITMENT BINDS THE BANK', async () => {
  // Found by mutation testing: making criteriaHash a constant left the suite
  // green. Without the bank in the commitment, a doer could commit once and
  // then pick its syllabus after seeing the beacon — the grinding attack
  // arriving through the other input. Different bank must mean a different
  // request, and therefore a different draw.
  const otherBank = BANK.map((c, i) => (i === 0 ? { ...c, statement: 'something else entirely' } : c));
  const a = await assemble();
  const b = await assemble({ bank: otherBank });
  truthy(
    a.assignment.requestCommitment !== b.assignment.requestCommitment,
    'changing the bank must change the request commitment'
  );
});

// ── the attacks ─────────────────────────────────────────────────────────────

await check('A PROOF STAPLED TO A DIFFERENT CONTRACT IS CAUGHT', async () => {
  // Both proofs verify on their own. Only the contract-to-proof comparison
  // catches this, and it is the check a reader is most likely to skip.
  const a = await assemble();
  const friendlier = POOL.find((c) => c.did !== a.unsigned.checkerDid).did;
  const swapped = { ...a.unsigned, checkerDid: friendlier };

  const v = await verifyAssignedContract({
    unsigned: swapped, assignment: a.assignment, criteriaProof: a.criteriaProof,
    pool: POOL, bank: BANK,
  });
  eq(v.outcome, 'FAILED', 'renaming the checker must fail');
  eq(v.checkerWasDrawn, false, 'and be reported as a checker mismatch');
  match(v.detail, /but the draw produced/, 'naming both sides');
});

await check('easier criteria swapped into the contract are caught', async () => {
  const a = await assemble();
  const softened = a.unsigned.criteria.map((c) => ({ ...c, minScore: 0.1 }));
  const v = await verifyAssignedContract({
    unsigned: { ...a.unsigned, criteria: softened }, assignment: a.assignment,
    criteriaProof: a.criteriaProof, pool: POOL, bank: BANK,
  });
  eq(v.outcome, 'FAILED', 'lowering the floors after the draw must fail');
  eq(v.criteriaWereDrawn, false, 'and be reported as a criteria mismatch');
});

await check('ONE COMMITMENT, ONE BEACON — re-rolling one draw is caught', async () => {
  // Keep the exam you like, re-roll the judge. Both proofs verify; they simply
  // do not belong to the same request.
  const a = await assemble();
  const b = await assemble({ nonce: 'n2' });

  const v = await verifyAssignedContract({
    unsigned: a.unsigned, assignment: a.assignment, criteriaProof: b.criteriaProof,
    pool: POOL, bank: BANK,
  });
  eq(v.outcome, 'FAILED', 'two draws from different requests must fail');
  eq(v.singleDraw, false, 'and be reported as a re-roll');
  match(v.detail, /re-rolled/, 'with the reason named');
});

await check('a different beacon between the two draws is caught', async () => {
  const a = await assemble();
  const b = await assemble({ beacon: 'drand:round:9999' });
  const v = await verifyAssignedContract({
    unsigned: a.unsigned, assignment: a.assignment, criteriaProof: b.criteriaProof,
    pool: POOL, bank: BANK,
  });
  eq(v.singleDraw, false, 'two beacons means one was re-rolled');
  eq(v.outcome, 'FAILED', 'and the assembly fails');
});

await check('an edited panel is caught', async () => {
  const a = await assemble();
  const stranger = await generateKeyPair();
  const edited = [...POOL.slice(0, 4), { did: stranger.did, qualification: { tier: 3, badges: ['security-audit'] } }];
  const v = await verifyAssignedContract({
    unsigned: a.unsigned, assignment: a.assignment, criteriaProof: a.criteriaProof,
    pool: edited, bank: BANK,
  });
  eq(v.outcome, 'FAILED', 'a changed panel must fail');
});

await check('an unreadable proof is NOT_CHECKED, not FAILED', async () => {
  const a = await assemble();
  const v = await verifyAssignedContract({
    unsigned: a.unsigned,
    assignment: { ...a.assignment, version: 'zkrepid:checker-assignment:v99' },
    criteriaProof: a.criteriaProof, pool: POOL, bank: BANK,
  });
  eq(v.outcome, 'NOT_CHECKED', 'a format we cannot read is not a forgery we detected');
});

await check('THE THREE PRECONDITIONS ARE STATED, not hidden behind a green outcome', async () => {
  // beacon provenance, bank authorship, panel membership. Each can make a
  // perfectly verifying assembly meaningless.
  const a = await assemble();
  const v = await verifyAssignedContract({
    unsigned: a.unsigned, assignment: a.assignment, criteriaProof: a.criteriaProof,
    pool: POOL, bank: BANK,
  });
  eq(v.outcome, 'VERIFIED', 'the assembly is sound');
  match(v.detail, /who supplied the beacon/, 'beacon provenance must be named');
  match(v.detail, /who wrote the bank/, 'bank authorship must be named');
  match(v.detail, /who maintains the panel/, 'panel membership must be named');
});

rmSync(outDir, { recursive: true, force: true });

console.log(`\nassigned-contract: ${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}
console.log('All assigned-contract checks passed.');
