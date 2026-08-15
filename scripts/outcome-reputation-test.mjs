#!/usr/bin/env node
// scripts/outcome-reputation-test.mjs — what a verdict may and may not do to reputation.
//
// Run: node scripts/outcome-reputation-test.mjs
//
// The assertions that carry this file are mostly about what does NOT happen,
// which is unusual and is the point — the number of things one verdict genuinely
// proves about anybody is small:
//
//   * 'A VERDICT ALONE EARNS THE CHECKER NOTHING' — otherwise rendering verdicts
//     is a way to earn reputation, which is self-certification one layer up.
//   * 'A FORGED VERDICT MOVES NOTHING' — a verdict that failed signature or
//     binding must not be able to move a real score.
//   * 'THE MISSING SIGNAL IS REPORTED, NOT HIDDEN' — the closed set has no
//     signal for verified work. An empty `events` array reads as "no activity";
//     a populated `withheld` reads as "nothing was earned, and here is why".
//   * 'the partition is TOTAL' — an unclassified signal is weightless, and
//     weightless is what it silently becomes.
//   * 'latency is NOT progress' — a fast agent is not a correct one.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.outcome-rep-check-'));
let did, wc, o2r, rt;
try {
  execFileSync(
    localTsc(),
    [
      'lib/trustshell/identity/did.ts',
      'lib/trustshell/identity/work-contract.ts',
      'lib/trustshell/identity/reputation-transition.ts',
      'lib/trustshell/identity/outcome-to-reputation.ts',
      '--outDir', outDir,
      '--rootDir', 'lib',          // pinned; see work-contract-test.mjs
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
  rt = await import(pathToFileURL(join(base, 'reputation-transition.js')).href);
  o2r = await import(pathToFileURL(join(base, 'outcome-to-reputation.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('outcome-to-reputation compilation failed\n');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}

const { generateKeyPair } = did;
const { proposeContract, countersignContract, verifyContract, verifyVerdict, issueVerdict, CONTRACT_DOMAIN, VERDICT_DOMAIN } = wc;
const { REPUTATION_SIGNALS } = rt;
const { reputationForVerdict, partitionByProgress, isProgress, SIGNAL_KIND, assertPartitionTotal } = o2r;

let passed = 0;
const failures = [];
const check = async (name, fn) => {
  try { await fn(); passed += 1; } catch (e) { failures.push(`${name}\n    ${e.message}`); }
};
const eq = (a, b, what) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};
const truthy = (v, what) => { if (!v) throw new Error(`${what}: expected truthy, got ${JSON.stringify(v)}`); };
const match = (s, re, what) => { if (!re.test(String(s))) throw new Error(`${what}: ${JSON.stringify(String(s))} !~ ${re}`); };
const throws = async (fn, re, what) => {
  try { await fn(); } catch (e) { if (!re.test(e.message)) throw new Error(`${what}: wrong error ${JSON.stringify(e.message)}`); return; }
  throw new Error(`${what}: expected a throw, got none`);
};

// ── fixtures ────────────────────────────────────────────────────────────────

const doer = await generateKeyPair();
const checker = await generateKeyPair();
const observer = await generateKeyPair();

const CRITERIA = [{ id: 'tests', statement: 'the suite passes', minScore: 0.9 }];

const agreed = async () => {
  const unsigned = {
    version: CONTRACT_DOMAIN, taskId: 't1', deliverable: 'a thing',
    criteria: CRITERIA, doerDid: doer.did, checkerDid: checker.did,
    proposedAt: '2026-08-15T00:00:00.000Z',
  };
  const { doerSignature } = await proposeContract({ unsigned, doerKey: doer.privateKey });
  return countersignContract({ unsigned, doerSignature, checkerKey: checker.privateKey });
};

const judged = async (outcome = 'VERIFIED', score = 0.95) => {
  const contract = await agreed();
  const { contractHash } = await verifyContract(contract);
  const verdict = await issueVerdict({
    unsigned: {
      version: VERDICT_DOMAIN, contractHash, evidenceHash: 'sha256:' + 'a'.repeat(64),
      checkerDid: checker.did, outcome,
      scores: [{ criterionId: 'tests', outcome, score }],
      issuedAt: '2026-08-15T01:00:00.000Z',
    },
    checkerKey: checker.privateKey,
  });
  const verification = await verifyVerdict({ verdict, contract });
  return { contract, verdict, verification, verdictHash: verification.verdictHash };
};

const call = (over = {}) => reputationForVerdict({
  doerDid: doer.did,
  observedAt: '2026-08-15T02:00:00.000Z',
  ...over,
});

// ── the partition ───────────────────────────────────────────────────────────

await check('THE PARTITION IS TOTAL over the closed signal set', () => {
  // A signal with no kind is weightless, and weightless is exactly what an
  // unclassified signal silently becomes at any boundary where the union is
  // erased.
  assertPartitionTotal();
  for (const s of REPUTATION_SIGNALS) {
    truthy(['progress', 'evidence', 'neither'].includes(SIGNAL_KIND[s]), `${s} must have a kind`);
  }
  eq(Object.keys(SIGNAL_KIND).sort(), [...REPUTATION_SIGNALS].sort(), 'no signal may be missing or extra');
});

await check('THE TOTALITY GUARD ACTUALLY FIRES when a signal has no kind', () => {
  // Found by mutation: calling assertPartitionTotal() on a complete map passes
  // whether or not the guard does anything, so the call alone proved nothing.
  // The union is erased at every boundary these events cross — a signal
  // arriving over HTTP is `any`, and SIGNAL_KIND[unknown] is `undefined`, which
  // classifies it as none of the three while looking like it worked. Removing a
  // kind is the only way to show the guard notices.
  const saved = SIGNAL_KIND.latency_sample;
  delete SIGNAL_KIND.latency_sample;
  try {
    let threw = false;
    try { assertPartitionTotal(); } catch (e) { threw = /weightless/.test(e.message); }
    truthy(threw, 'an unclassified signal must be refused, and named as weightless');
  } finally {
    SIGNAL_KIND.latency_sample = saved;
  }
  assertPartitionTotal(); // restored
});

await check('the three deliberate PAIRS split progress from evidence', () => {
  eq(isProgress('bft_vote_correct'), true, 'correct vote is progress');
  eq(isProgress('bft_vote_incorrect'), false, 'incorrect vote is not');
  eq(isProgress('veritas_catch'), true, 'a catch is progress');
  eq(isProgress('veritas_miss'), false, 'a miss is not');
  eq(isProgress('x402_settled'), true, 'settlement is progress');
  eq(isProgress('x402_failed'), false, 'a failed settlement is not');
});

await check('LATENCY IS NOT PROGRESS — a fast agent is not a correct one', () => {
  // Letting latency earn standing would make speed a route to trust.
  eq(SIGNAL_KIND.latency_sample, 'neither', 'latency must not advance standing');
  eq(isProgress('latency_sample'), false, 'nor count as progress');
});

await check('EVIDENCE IS RECORDED, NOT DISCARDED', () => {
  // The middle kind carries the design. A history that only remembers successes
  // is a history nobody can audit.
  const events = [
    { subject: 'a', signal: 'veritas_catch', observedAt: 'x' },
    { subject: 'a', signal: 'veritas_miss', observedAt: 'x' },
    { subject: 'a', signal: 'latency_sample', value: 12, observedAt: 'x' },
  ];
  const p = partitionByProgress(events);
  eq(p.progress.length, 1, 'one progress event');
  eq(p.evidence.length, 1, 'the failure must still be present, as evidence');
  eq(p.neither.length, 1, 'and the measurement is neither');
  eq(p.progress.length + p.evidence.length + p.neither.length, events.length, 'nothing may be dropped');
});

// ── what a verdict earns ────────────────────────────────────────────────────

await check('A VERDICT ALONE EARNS THE CHECKER NOTHING', async () => {
  // The whole point. If a verdict paid its author, reputation would measure
  // output volume and the checker's score would rise by rendering verdicts.
  const { verdict, verification, verdictHash } = await judged();
  const r = call({ verdict, verification, verdictHash });
  eq(r.events.length, 0, 'no events may be emitted without ground truth');
  const checkerNote = r.withheld.find((w) => w.subject === checker.did);
  truthy(checkerNote, 'the checker must be named in withheld');
  match(checkerNote.reason, /unestablished/, 'and the reason must say why');
});

await check('THE MISSING SIGNAL IS REPORTED, NOT HIDDEN', async () => {
  // An empty `events` array reads as "no activity". A populated `withheld`
  // reads as "nothing was earned, and here is why" — which is the only form of
  // a known limitation that survives contact with a dashboard.
  const { verdict, verification, verdictHash } = await judged('VERIFIED');
  const r = call({ verdict, verification, verdictHash });
  const doerNote = r.withheld.find((w) => w.subject === doer.did);
  truthy(doerNote, 'the doer must appear in withheld even though it earned nothing');
  eq(doerNote.signal, null, 'null signal means the vocabulary is missing a word');
  match(doerNote.reason, /no signal for/, 'the gap must be named explicitly');
  match(doerNote.reason, /cross-lane/, 'and say why it is not closed here');
});

await check('a FAILED verdict also finds no signal, and says so symmetrically', async () => {
  // Reusing an unrelated signal to record failed work would corrupt what that
  // signal measures, which is worse than recording nothing and saying so.
  const { verdict, verification, verdictHash } = await judged('FAILED', 0.1);
  eq(verification.outcome, 'FAILED', 'precondition');
  const r = call({ verdict, verification, verdictHash });
  const doerNote = r.withheld.find((w) => w.subject === doer.did);
  match(doerNote.reason, /no signal for failed work/, 'the symmetric gap must be named');
  match(doerNote.reason, /corrupt what that signal measures/, 'and the reason it is not faked');
});

await check('A FORGED VERDICT MOVES NOTHING', async () => {
  // Otherwise a verdict with a broken signature could move a real score.
  const { verdict, verification, verdictHash } = await judged();
  const broken = { ...verification, signatureValid: false, outcome: 'FAILED' };
  const r = call({ verdict, verification: broken, verdictHash });
  eq(r.events.length, 0, 'a forged verdict must move nothing');
  eq(r.withheld.length, 2, 'and must withhold for both parties');
  match(r.withheld[0].reason, /did not verify/, 'reason');
});

await check('AN UNBOUND VERDICT MOVES NOTHING — asserted WITH an observation', async () => {
  // Found by mutation: the first version of this test omitted the observation,
  // so `events.length === 0` held whether or not the binding was checked —
  // nothing is emitted without ground truth anyway. The assertion passed while
  // testing nothing. The observation is what makes an event possible, and
  // therefore what makes its absence evidence that the binding check ran.
  const { verdict, verification, verdictHash } = await judged();
  const observation = {
    verdictHash, source: 'human_review', actual: 'VERIFIED',
    observerDid: observer.did, observedAt: 'later',
  };
  const bound = call({ verdict, verification, verdictHash, observation });
  eq(bound.events.length, 1, 'control: a bound verdict with an observation DOES emit');

  const unbound = call({
    verdict, verification: { ...verification, boundToContract: false }, verdictHash, observation,
  });
  eq(unbound.events.length, 0, 'a verdict not bound to its contract must move nothing');
});

// ── ground truth ────────────────────────────────────────────────────────────

await check('a CONFIRMED verdict earns the checker a veritas_catch', async () => {
  const { verdict, verification, verdictHash } = await judged();
  const r = call({
    verdict, verification, verdictHash,
    observation: {
      verdictHash, source: 'downstream_outcome', actual: 'VERIFIED',
      observerDid: observer.did, observedAt: 'later',
    },
  });
  eq(r.events.length, 1, 'one event');
  eq(r.events[0].signal, 'veritas_catch', 'a confirmed verdict is a catch');
  eq(r.events[0].subject, checker.did, 'and it accrues to the CHECKER, not the doer');
  eq(isProgress(r.events[0].signal), true, 'and it is progress');
});

await check('a CONTRADICTED verdict earns a veritas_miss, which is evidence not progress', async () => {
  const { verdict, verification, verdictHash } = await judged();
  const r = call({
    verdict, verification, verdictHash,
    observation: {
      verdictHash, source: 'human_review', actual: 'FAILED',
      observerDid: observer.did, observedAt: 'later',
    },
  });
  eq(r.events[0].signal, 'veritas_miss', 'a contradicted verdict is a miss');
  eq(isProgress(r.events[0].signal), false, 'and a miss is evidence, not progress');
  eq(partitionByProgress(r.events).evidence.length, 1, 'it must land in evidence');
});

await check('THE CHECKER GRADING ITSELF THROWS — it is not silently withheld', async () => {
  // A caller bug, and a loud one: swallowing it would turn an attempt to
  // launder self-certification through a ground-truth field into a quietly
  // empty result that looks like an ordinary no-op.
  const { verdict, verification, verdictHash } = await judged();
  await throws(
    async () => call({
      verdict, verification, verdictHash,
      observation: {
        verdictHash, source: 'human_review', actual: 'VERIFIED',
        observerDid: checker.did, observedAt: 'later',
      },
    }),
    /self-certification one layer up/,
    'the checker graded itself and nothing stopped it'
  );
});

await check('an observation about a DIFFERENT verdict grades nobody', async () => {
  const { verdict, verification, verdictHash } = await judged();
  const r = call({
    verdict, verification, verdictHash,
    observation: {
      verdictHash: 'sha256:' + 'f'.repeat(64), source: 'human_review',
      actual: 'FAILED', observerDid: observer.did, observedAt: 'later',
    },
  });
  eq(r.events.length, 0, 'an unmatched observation must grade nobody');
  match(r.withheld.find((w) => w.subject === checker.did).reason, /different verdict/, 'reason');
});

rmSync(outDir, { recursive: true, force: true });

console.log(`\noutcome-reputation: ${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}
console.log('All outcome-reputation checks passed.');
