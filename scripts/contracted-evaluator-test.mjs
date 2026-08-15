#!/usr/bin/env node
// scripts/contracted-evaluator-test.mjs — the joint between loop, contract and judge.
//
// Run: node scripts/contracted-evaluator-test.mjs
//
// This is the file where three components that were each individually tested
// start touching each other, so the assertions are about the SEAMS:
//
//   * 'THE CONTRACT'S CRITERIA WIN over the caller's' — the loop passes criteria
//     and so does the signed contract. If the caller's list won, handing the
//     evaluator an easier list would be re-scoping through the front door.
//   * 'work by an agent the contract does not name is NOT_CHECKED' — every
//     signature checks out while the verdict vouches for the wrong agent.
//   * 'THE JUDGE NEVER SEES THE AGENT'S OWN SUMMARY' — a judge told the answer
//     by the party under examination is not independent. Anthropic measured
//     evaluators being talked into leniency.
//   * 'a judge outage is NOT_CHECKED per criterion, not FAILED' — a provider
//     outage must not read as a defect report.
//   * 'disagreement is RECORDED even when it does not gate' — the number has to
//     exist before a threshold can be chosen from data rather than guessed.
//   * 'the adapter satisfies the kernel port' — the types are restated rather
//     than imported, so something must assert they still line up.
//
// Real keys, real signatures. A signing test with a stubbed verifier tests the
// stub.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';
import { compileHarness } from './lib/harness-compile.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.contracted-eval-check-'));
let did, wc, ce;
try {
  execFileSync(
    localTsc(),
    [
      'lib/trustshell/identity/did.ts',
      'lib/trustshell/identity/work-contract.ts',
      'lib/trustshell/identity/contracted-evaluator.ts',
      '--outDir', outDir,
      // Pinned — see work-contract-test.mjs. Third occurrence of the hazard.
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
  ce = await import(pathToFileURL(join(base, 'contracted-evaluator.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('contracted-evaluator compilation failed\n');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}

const { load } = compileHarness();
const { runAgentLoop } = await load('loop');
const { ManualClock } = await load('types');

const { generateKeyPair } = did;
const { proposeContract, countersignContract, verifyContract, verifyVerdict, CONTRACT_DOMAIN } = wc;
const { createContractedEvaluator, renderEvidence } = ce;

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
const falsy = (v, what) => { if (v) throw new Error(`${what}: expected falsy, got ${JSON.stringify(v)}`); };
const match = (s, re, what) => { if (!re.test(String(s))) throw new Error(`${what}: ${JSON.stringify(String(s))} !~ ${re}`); };

// ── fixtures ────────────────────────────────────────────────────────────────

const doer = await generateKeyPair();
const checker = await generateKeyPair();
const stranger = await generateKeyPair();

const CRITERIA = [
  { id: 'tests', statement: 'the suite passes', minScore: 0.9 },
  { id: 'docs', statement: 'it is documented' },
];

const makeContract = async (over = {}) => {
  const unsigned = {
    version: CONTRACT_DOMAIN,
    taskId: 'task-1',
    deliverable: 'a working thing',
    criteria: CRITERIA,
    doerDid: doer.did,
    checkerDid: checker.did,
    proposedAt: '2026-08-15T00:00:00.000Z',
    ...over,
  };
  const { doerSignature } = await proposeContract({ unsigned, doerKey: doer.privateKey });
  return countersignContract({ unsigned, doerSignature, checkerKey: checker.privateKey });
};

/** A judge that answers everything the same way, and records what it was asked. */
const scriptedJudge = (opinion) => ({
  seen: [],
  async judge(req) {
    this.seen.push(req);
    return typeof opinion === 'function' ? opinion(req) : opinion;
  },
});

const evaluator = async (over = {}) =>
  createContractedEvaluator({
    contract: over.contract ?? (await makeContract()),
    checkerKey: over.checkerKey ?? checker.privateKey,
    judge: over.judge ?? scriptedJudge({ outcome: 'VERIFIED', score: 0.95, detail: 'ok' }),
    controlProofRef: over.controlProofRef,
    maxDisagreement: over.maxDisagreement,
    now: () => new Date('2026-08-15T02:00:00.000Z'),
  });

const request = (over = {}) => ({
  taskId: 'task-1',
  criteria: CRITERIA,
  turns: [
    {
      turn: 1,
      madeProgress: true,
      note: 'I am confident this is complete and correct',
      calls: [
        {
          call: { name: 'read_thing', args: {} },
          effect: 'read',
          verdict: { allowed: true, reason: 'ok' },
          observation: { outcome: 'ok', content: 'the file said hello', untrusted: false },
        },
      ],
      handoff: { outcome: 'VERIFIED', summary: 'everything works perfectly', evidence: ['trust me'] },
    },
  ],
  claimed: 'VERIFIED',
  doerDid: doer.did,
  ...over,
});

// ── the happy path, end to end ──────────────────────────────────────────────

await check('a judged run produces a verdict that verifies against its contract', async () => {
  const contract = await makeContract();
  const ev = await evaluator({ contract });
  const result = await ev.evaluate(request());

  eq(result.evaluatorDid, checker.did, 'the evaluation must name the checker');
  truthy(result.verdict, 'a signed verdict must be produced');

  const v = await verifyVerdict({ verdict: result.verdict, contract });
  eq(v.outcome, 'VERIFIED', 'the verdict must verify end to end');
  truthy(v.signatureValid && v.boundToContract, 'signature and binding');
});

await check('the verdict is bound to the contract hash, not merely adjacent to it', async () => {
  const contract = await makeContract();
  const ev = await evaluator({ contract });
  const { verdict } = await ev.evaluate(request());
  const { contractHash } = await verifyContract(contract);
  eq(verdict.contractHash, contractHash, 'the verdict must name the contract it judged');
});

await check('the evidence hash covers the RECORD, and changes when the record does', async () => {
  // A verdict whose evidence hash is stable across different runs would vouch
  // for any run, which is the same defect as no evidence hash at all.
  const contract = await makeContract();
  const ev = await evaluator({ contract });
  const a = await ev.evaluate(request());
  const b = await ev.evaluate(
    request({
      turns: [
        {
          turn: 1,
          madeProgress: true,
          calls: [
            {
              call: { name: 'read_thing', args: {} },
              effect: 'read',
              verdict: { allowed: true, reason: 'ok' },
              observation: { outcome: 'ok', content: 'the file said something ELSE', untrusted: false },
            },
          ],
        },
      ],
    })
  );
  truthy(a.verdict.evidenceHash !== b.verdict.evidenceHash, 'a different run must hash differently');
});

// ── the seams ───────────────────────────────────────────────────────────────

await check("THE CONTRACT'S CRITERIA WIN over the caller's", async () => {
  // The loop passes criteria and so does the signed contract. If the caller's
  // list won, handing the evaluator a shorter one would be re-scoping through
  // the front door — no forged signature required.
  const contract = await makeContract();
  const judge = scriptedJudge({ outcome: 'VERIFIED', score: 0.95, detail: 'ok' });
  const ev = await evaluator({ contract, judge });
  const result = await ev.evaluate(request({ criteria: [{ id: 'tests', statement: 'easier' }] }));

  eq(judge.seen.length, 2, 'both contracted criteria must be judged, not the caller\'s one');
  eq(
    judge.seen.map((r) => r.criterion.id).sort(),
    ['docs', 'tests'],
    'the criteria judged must come from the contract'
  );
  match(result.detail, /the contract is the authority/, 'the mismatch must be reported');
});

await check('a criterion STATEMENT from the caller cannot override the contract', async () => {
  // The subtler version: same ids, weaker statements.
  const contract = await makeContract();
  const judge = scriptedJudge({ outcome: 'VERIFIED', score: 0.95, detail: 'ok' });
  const ev = await evaluator({ contract, judge });
  await ev.evaluate(
    request({
      criteria: [
        { id: 'tests', statement: 'anything at all', minScore: 0 },
        { id: 'docs', statement: 'anything at all' },
      ],
    })
  );
  const tests = judge.seen.find((r) => r.criterion.id === 'tests');
  eq(tests.criterion.statement, 'the suite passes', 'the signed statement must be what is judged');
  eq(tests.criterion.minScore, 0.9, 'and the signed floor, not the caller\'s');
});

await check('WORK BY AN AGENT THE CONTRACT DOES NOT NAME IS NOT_CHECKED', async () => {
  // Every signature checks out and the verdict would vouch for the wrong agent.
  const contract = await makeContract();
  const ev = await evaluator({ contract });
  const result = await ev.evaluate(request({ doerDid: stranger.did }));
  eq(result.verdicts.every((v) => v.outcome === 'NOT_CHECKED'), true, 'nothing may be certified');
  falsy(result.verdict, 'no verdict may be signed for the wrong agent');
  match(result.detail, /vouch for the wrong agent/, 'reason');
});

await check('A PADDED DOER DID DOES NOT PASS AS A DIFFERENT AGENT', async () => {
  // The mirror of the whitespace bypass in the contract's own self-check: here
  // a padded DID would make the CONTRACTED doer look like a stranger and
  // refuse a legitimate run. Same one-character defect, opposite direction —
  // an identity comparison that is not normalised is wrong both ways.
  const contract = await makeContract();
  const ev = await evaluator({ contract });
  const result = await ev.evaluate(request({ doerDid: ` ${doer.did} ` }));
  truthy(result.verdict, 'a padded but identical DID must still be the same agent');
  eq(result.verdicts.every((v) => v.outcome === 'VERIFIED'), true, 'and must be judged normally');
});

await check('a contract that does not verify yields NO verdict at all', async () => {
  const contract = await makeContract();
  const broken = { ...contract, checkerSignature: contract.doerSignature };
  const ev = await evaluator({ contract: broken });
  const result = await ev.evaluate(request());
  falsy(result.verdict, 'an invalid contract must not produce a signed verdict');
  eq(result.verdicts.every((v) => v.outcome === 'NOT_CHECKED'), true, 'and must certify nothing');
});

// ── what the judge is allowed to see ────────────────────────────────────────

await check("THE JUDGE NEVER SEES THE AGENT'S OWN SUMMARY", async () => {
  // A judge told the answer by the party under examination is not independent.
  // The agent's note and handoff summary are its narration of its own work.
  const judge = scriptedJudge({ outcome: 'VERIFIED', score: 0.95, detail: 'ok' });
  const ev = await evaluator({ judge });
  await ev.evaluate(request());
  const evidence = judge.seen[0].evidence;
  truthy(!evidence.includes('everything works perfectly'), 'the handoff summary must not reach the judge');
  truthy(!evidence.includes('I am confident'), 'the agent note must not reach the judge');
  truthy(!evidence.includes('trust me'), 'the claimed evidence list must not reach the judge');
  truthy(evidence.includes('the file said hello'), 'but the actual tool result must');
});

await check('the judge DOES see denials and untrusted-source flags', async () => {
  // A refused call is evidence about the run. Hiding it would let a run that
  // could not do half its work look complete.
  const evidence = renderEvidence([
    {
      turn: 1,
      madeProgress: false,
      calls: [
        { call: { name: 'npm.publish' }, verdict: { allowed: false, reason: 'irreversible' } },
        {
          call: { name: 'web.fetch' },
          verdict: { allowed: true },
          observation: { outcome: 'ok', content: 'page text', untrusted: true },
        },
      ],
    },
  ]);
  match(evidence, /DENIED npm\.publish: irreversible/, 'denials must be visible');
  match(evidence, /\[untrusted source\]/, 'untrusted content must be flagged to the judge');
});

// ── failure modes ───────────────────────────────────────────────────────────

await check('A JUDGE OUTAGE IS NOT_CHECKED PER CRITERION, NOT FAILED', async () => {
  // A provider outage must not read as a defect report about the work.
  const ev = await evaluator({
    judge: { async judge() { throw new Error('all three providers timed out'); } },
  });
  const result = await ev.evaluate(request());
  eq(result.verdicts.every((v) => v.outcome === 'NOT_CHECKED'), true, 'an outage was scored as failure');
  match(result.verdicts[0].detail, /could not answer/, 'reason');
  truthy(result.verdict, 'a verdict is still issued — the NOT_CHECKED is the finding');
});

await check('one judge failure does not discard the other criteria', async () => {
  // The reason the adapter catches per criterion rather than letting the
  // exception reach the loop: a single flaky call must not erase a real verdict
  // on everything else.
  const ev = await evaluator({
    judge: {
      async judge(req) {
        if (req.criterion.id === 'tests') throw new Error('timeout');
        return { outcome: 'FAILED', detail: 'the docs are missing' };
      },
    },
  });
  const result = await ev.evaluate(request());
  eq(result.verdicts.find((v) => v.criterionId === 'tests').outcome, 'NOT_CHECKED', 'the failed one');
  eq(result.verdicts.find((v) => v.criterionId === 'docs').outcome, 'FAILED', 'the answered one survives');
});

await check('the verdict outcome is the WEAKEST criterion, never an average', async () => {
  const ev = await evaluator({
    judge: {
      async judge(req) {
        return req.criterion.id === 'docs'
          ? { outcome: 'FAILED', detail: 'missing' }
          : { outcome: 'VERIFIED', score: 1, detail: 'ok' };
      },
    },
  });
  const result = await ev.evaluate(request());
  eq(result.verdict.outcome, 'FAILED', 'one failure must fail the verdict');
});

// ── disagreement ────────────────────────────────────────────────────────────

await check('DISAGREEMENT IS RECORDED EVEN WHEN IT DOES NOT GATE', async () => {
  // The number must exist before a threshold can be chosen from data. If it
  // were only recorded when it gated, the data needed to pick the threshold
  // would only appear once the threshold was already picked.
  const ev = await evaluator({
    judge: scriptedJudge({ outcome: 'VERIFIED', score: 0.95, disagreement: 0.7, detail: 'split' }),
  });
  const result = await ev.evaluate(request());
  eq(result.disagreement.tests, 0.7, 'disagreement must be recorded');
  eq(result.verdicts[0].outcome, 'VERIFIED', 'and must NOT gate when no threshold is set');
});

await check('disagreement above an EXPLICIT threshold caps the criterion at NOT_CHECKED', async () => {
  const ev = await evaluator({
    maxDisagreement: 0.5,
    judge: scriptedJudge({ outcome: 'VERIFIED', score: 0.95, disagreement: 0.7, detail: 'split' }),
  });
  const result = await ev.evaluate(request());
  eq(result.verdicts[0].outcome, 'NOT_CHECKED', 'a split panel established nothing');
  match(result.verdicts[0].detail, /unestablished rather than judged/, 'reason');
});

await check('DISAGREEMENT EXACTLY AT THE MAXIMUM DOES NOT GATE', async () => {
  // Found by mutation: `>` and `>=` were interchangeable against every other
  // assertion here. `maxDisagreement` is a MAXIMUM ACCEPTABLE value, so the
  // boundary itself is acceptable — and the neighbouring value must still gate,
  // or the test proves the comparison is loose rather than correct. Third time
  // this exact class has surfaced in this sprint (expiresAt, minScore, now this).
  const at = await evaluator({
    maxDisagreement: 0.5,
    judge: scriptedJudge({ outcome: 'VERIFIED', score: 0.95, disagreement: 0.5, detail: 'exactly at' }),
  });
  eq((await at.evaluate(request())).verdicts[0].outcome, 'VERIFIED', 'the boundary itself must be acceptable');

  const over = await evaluator({
    maxDisagreement: 0.5,
    judge: scriptedJudge({ outcome: 'VERIFIED', score: 0.95, disagreement: 0.5000001, detail: 'just over' }),
  });
  eq((await over.evaluate(request())).verdicts[0].outcome, 'NOT_CHECKED', 'just over must gate');
});

await check('a split panel can still CONDEMN — the cap only removes certification', async () => {
  // weaker(FAILED, NOT_CHECKED) is FAILED. A panel that disagrees about how bad
  // something is has still not agreed that it is fine.
  const ev = await evaluator({
    maxDisagreement: 0.5,
    judge: scriptedJudge({ outcome: 'FAILED', disagreement: 0.9, detail: 'split but negative' }),
  });
  const result = await ev.evaluate(request());
  eq(result.verdicts[0].outcome, 'FAILED', 'a split condemnation must survive the cap');
});

await check('ABSENT DISAGREEMENT IS NOT RECORDED AS UNANIMOUS', async () => {
  // A single-model judge has no disagreement to report. Recording 0 would make
  // the cheapest judge look like the most confident one.
  const ev = await evaluator({
    maxDisagreement: 0.5,
    judge: scriptedJudge({ outcome: 'VERIFIED', score: 0.95, detail: 'single model' }),
  });
  const result = await ev.evaluate(request());
  eq(Object.prototype.hasOwnProperty.call(result.disagreement, 'tests'), false, 'no number must be invented');
  eq(result.verdicts[0].outcome, 'VERIFIED', 'and an unknown must not trip the gate either way');
});

// ── the seam with the kernel ────────────────────────────────────────────────

await check('THE ADAPTER SATISFIES THE KERNEL PORT, END TO END', async () => {
  // The types are restated rather than imported, so something has to assert
  // they still line up. Running the real loop with this evaluator is the
  // strongest available form of that assertion — it exercises the shape the
  // kernel actually consumes rather than a shape a test author believed it did.
  const contract = await makeContract();
  const ev = await evaluator({ contract });

  const result = await runAgentLoop({
    taskId: 'task-1',
    policy: {
      maxIterations: 3,
      noProgressAbortAfter: 3,
      toolsAllowed: ['read_thing'],
      irreversibleRequiresHuman: [],
      untrustedOutputSources: [],
      maxWritesPerSession: 0,
      toolEffects: { read_thing: 'read' },
      // Left at its default (ON) on purpose: this is the one suite where an
      // evaluator IS wired, so the strict default is the condition under test.
    },
    model: {
      calls: 0,
      async turn() {
        this.calls += 1;
        if (this.calls === 1) return { calls: [{ id: 'a', name: 'read_thing', args: {} }] };
        return { calls: [], handoff: { outcome: 'VERIFIED', summary: 'done', evidence: [] } };
      },
    },
    tools: { async call() { return { content: 'ok' }; } },
    authorizer: { async authorize() { return { allowed: true, reason: 'test' }; } },
    evaluator: ev,
    criteria: CRITERIA,
    doerDid: doer.did,
    clock: new ManualClock(1000),
  });

  eq(result.outcome, 'VERIFIED', 'a judged clean run must stand');
  eq(result.evaluation.independent, true, 'the kernel must see checker != doer');
  eq(result.evaluation.ran, true, 'the evaluation must have run');
});

await check('A FAILING JUDGE DRIVES THE LOOP TO FAILED, overriding the agent claim', async () => {
  // The property the whole port exists for: the ceiling is arithmetic and
  // cannot see a stub that returns the right shape. Here every call succeeds,
  // every budget holds, the agent claims VERIFIED — and the judge disagrees.
  const contract = await makeContract();
  const ev = await evaluator({
    contract,
    judge: { async judge() { return { outcome: 'FAILED', detail: 'the feature is stubbed' }; } },
  });

  const result = await runAgentLoop({
    taskId: 'task-1',
    policy: {
      maxIterations: 3, noProgressAbortAfter: 3, toolsAllowed: ['read_thing'],
      irreversibleRequiresHuman: [], untrustedOutputSources: [],
      maxWritesPerSession: 0, toolEffects: { read_thing: 'read' },
    },
    model: { async turn() { return { calls: [], handoff: { outcome: 'VERIFIED', summary: 'done', evidence: [] } }; } },
    tools: { async call() { return { content: 'ok' }; } },
    authorizer: { async authorize() { return { allowed: true, reason: 'test' }; } },
    evaluator: ev,
    criteria: CRITERIA,
    doerDid: doer.did,
    clock: new ManualClock(1000),
  });

  eq(result.claimed, 'VERIFIED', 'the agent claimed success');
  eq(result.outcome, 'FAILED', 'and the independent judge overruled it');
  match(result.downgradedBecause, /stubbed/, 'the reason must carry the judge\'s finding');
});

rmSync(outDir, { recursive: true, force: true });

console.log(`\ncontracted-evaluator: ${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}
console.log('All contracted-evaluator checks passed.');
