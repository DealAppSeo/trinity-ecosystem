#!/usr/bin/env node
// scripts/spine-e2e-test.mjs — the whole spine, once, with nothing stubbed
// between the links.
//
// Run: node scripts/spine-e2e-test.mjs
//
// Every other suite tests one seam. This one runs the chain end to end and then
// hands the result to a stranger:
//
//   two DIDs → signed pre-execution contract → agent loop → staged judge →
//   contracted evaluator → signed verdict → portable envelope → offline verify
//
// THE ASSERTION ONLY THIS SUITE CAN MAKE — and it is mutation-proven, not
// asserted. The loop must hand the evaluator the SAME turns it reports. Change
// one character so it does not — `turns` in, `turns.slice(0, 1)` to the judge —
// and the verdict commits to evidence nobody was shown, while the run reports
// the full record. Measured 2026-08-15:
//
//     check:spine-e2e             RED   (caught)
//     check:harness-loop          GREEN (blind)  <- the kernel's own suite
//     check:contracted-evaluator  GREEN (blind)
//     check:verdict-envelope      GREEN (blind)
//     check:types                 GREEN (blind)
//
// Every other suite builds its evidence by hand, so it can only prove the digest
// agrees with a fixture — which stays true while the loop and the evaluator
// disagree about what the turn record is. Here `result.turns` comes out of the
// kernel and goes into `verifyEnvelope` untouched.
//
// The negative half matters as much: an envelope handed a DIFFERENT run's turns
// must fail. Otherwise "portable" means "vouches for anything".

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';
import { compileHarness } from './lib/harness-compile.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.spine-e2e-check-'));
let did, wc, ce, sj, env, ca, ac;
try {
  execFileSync(
    localTsc(),
    [
      'lib/trustshell/identity/did.ts',
      'lib/trustshell/identity/work-contract.ts',
      'lib/trustshell/identity/contracted-evaluator.ts',
      'lib/trustshell/identity/staged-judge.ts',
      'lib/trustshell/identity/verdict-envelope.ts',
      'lib/trustshell/identity/checker-assignment.ts',
      'lib/trustshell/identity/criteria-draw.ts',
      'lib/trustshell/identity/assigned-contract.ts',
      '--outDir', outDir,
      // Pinned — see work-contract-test.mjs. Sixth occurrence of the hazard.
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
  sj = await import(pathToFileURL(join(base, 'staged-judge.js')).href);
  env = await import(pathToFileURL(join(base, 'verdict-envelope.js')).href);
  ca = await import(pathToFileURL(join(base, 'checker-assignment.js')).href);
  ac = await import(pathToFileURL(join(base, 'assigned-contract.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('spine-e2e compilation failed\n');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}

const { load } = compileHarness();
const { runAgentLoop } = await load('loop');
const { ManualClock } = await load('types');

const { generateKeyPair } = did;
const { proposeContract, countersignContract, CONTRACT_DOMAIN } = wc;
const { createContractedEvaluator } = ce;
const { createStagedJudge } = sj;
const { packEnvelope, verifyEnvelope } = env;
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

// ── the run ─────────────────────────────────────────────────────────────────

const doer = await generateKeyPair();
const checker = await generateKeyPair();

const CRITERIA = [{ id: 'tests', statement: 'the suite passes', minScore: 0.9 }];

const makeContract = async () => {
  const unsigned = {
    version: CONTRACT_DOMAIN,
    taskId: 'spine-1',
    deliverable: 'a working thing',
    criteria: CRITERIA,
    doerDid: doer.did,
    checkerDid: checker.did,
    proposedAt: '2026-08-15T00:00:00.000Z',
  };
  const { doerSignature } = await proposeContract({ unsigned, doerKey: doer.privateKey });
  return countersignContract({ unsigned, doerSignature, checkerKey: checker.privateKey });
};

/** Runs the full chain and returns everything a third party would be handed. */
const runSpine = async (opinion = { outcome: 'VERIFIED', score: 0.95, detail: 'the suite is green' }) => {
  const contract = await makeContract();
  const staged = createStagedJudge({
    tiers: [
      // A cheap tier that cannot decide, so the run exercises escalation.
      { name: 'mechanical', judge: { async judge() { return { outcome: 'NOT_CHECKED', detail: 'no test command wired' }; } } },
      { name: 'panel', judge: { async judge() { return opinion; } } },
    ],
  });
  const evaluator = createContractedEvaluator({
    contract,
    checkerKey: checker.privateKey,
    judge: staged.judge,
    now: () => new Date('2026-08-15T02:00:00.000Z'),
  });

  const result = await runAgentLoop({
    taskId: 'spine-1',
    policy: {
      maxIterations: 3,
      noProgressAbortAfter: 3,
      toolsAllowed: ['run_tests'],
      irreversibleRequiresHuman: [],
      untrustedOutputSources: [],
      maxWritesPerSession: 0,
      toolEffects: { run_tests: 'read' },
    },
    model: {
      calls: 0,
      async turn() {
        this.calls += 1;
        if (this.calls === 1) return { calls: [{ id: 'a', name: 'run_tests', args: {} }] };
        return { calls: [], handoff: { outcome: 'VERIFIED', summary: 'done', evidence: [] } };
      },
    },
    tools: { async call() { return { content: '42 passed' }; } },
    authorizer: { async authorize() { return { allowed: true, reason: 'read-only' }; } },
    evaluator,
    criteria: CRITERIA,
    doerDid: doer.did,
    clock: new ManualClock(1000),
  });

  return { contract, result, staged };
};

// ── the chain ───────────────────────────────────────────────────────────────

await check('THE WHOLE SPINE RUNS, and the loop sees an independent checker', async () => {
  const { result } = await runSpine();
  eq(result.outcome, 'VERIFIED', 'a clean judged run must stand');
  eq(result.evaluation.ran, true, 'the evaluator must have run');
  eq(result.evaluation.independent, true, 'and the kernel must have established checker != doer');
});

await check('the staged judge escalated inside a real run', async () => {
  const { staged } = await runSpine();
  eq(staged.decisions.length, 1, 'one criterion, one decision');
  eq(staged.decisions[0].decidedBy, 'panel', 'the cheap tier could not certify');
  eq(staged.decisions[0].escalatedPast, ['mechanical'], 'so it escalated');
});

await check('A REAL RUN PRODUCES A PORTABLE ENVELOPE THAT VERIFIES OFFLINE', async () => {
  const { contract, result } = await runSpine();
  const verdict = result.evaluation.evaluation.verdict;
  truthy(verdict, 'the contracted evaluator must have signed a verdict');

  const envelope = await packEnvelope({ contract, verdict });
  const wire = JSON.parse(JSON.stringify(envelope));  // as a stranger receives it

  const check1 = await verifyEnvelope({ envelope: wire });
  eq(check1.outcome, 'VERIFIED', 'the envelope must verify with no access to us');
  eq(check1.doerDid, doer.did, 'and name who did the work');
  eq(check1.checkerDid, checker.did, 'and who judged it');
});

await check("THE LOOP'S OWN TURNS ARE THE EVIDENCE THE VERDICT COMMITTED TO", async () => {
  // The assertion no other suite can make. Everywhere else the evidence is
  // built by hand, which would still pass if the kernel and the evaluator
  // disagreed about what a turn record is.
  const { contract, result } = await runSpine();
  const envelope = await packEnvelope({ contract, verdict: result.evaluation.evaluation.verdict });

  const verified = await verifyEnvelope({
    envelope: JSON.parse(JSON.stringify(envelope)),
    evidence: result.turns,
  });
  eq(verified.evidenceMatches, true, 'the run that happened must be the run that was judged');
  eq(verified.outcome, 'VERIFIED', 'and the envelope must stand');
});

await check("ANOTHER RUN'S TURNS ARE REFUSED — portable is not 'vouches for anything'", async () => {
  const a = await runSpine();
  const b = await runSpine();
  const envelope = await packEnvelope({ contract: a.contract, verdict: a.result.evaluation.evaluation.verdict });

  // Make run B's evidence genuinely different in something renderEvidence
  // projects, rather than trusting two identical runs to differ.
  const otherTurns = JSON.parse(JSON.stringify(b.result.turns));
  otherTurns.push({ turn: 99, madeProgress: true, calls: [{ call: { name: 'run_tests' }, observation: { outcome: 'ok', content: '0 passed' } }] });

  const verified = await verifyEnvelope({
    envelope: JSON.parse(JSON.stringify(envelope)),
    evidence: otherTurns,
  });
  eq(verified.evidenceMatches, false, "another run's evidence must not match");
  eq(verified.outcome, 'FAILED', 'and that must reach the top-level outcome');
});

await check('a judge that fails the work produces an envelope that says so', async () => {
  // The envelope must carry bad news as faithfully as good news, or it is a
  // certificate rather than a verdict.
  const { contract, result } = await runSpine({ outcome: 'FAILED', detail: 'the feature is stubbed' });
  eq(result.outcome, 'FAILED', 'the independent judge overruled the agent');

  const verdict = result.evaluation.evaluation.verdict;
  truthy(verdict, 'a failing verdict is still signed');
  const envelope = await packEnvelope({ contract, verdict });
  const verified = await verifyEnvelope({ envelope: JSON.parse(JSON.stringify(envelope)), evidence: result.turns });

  eq(verified.outcome, 'FAILED', 'and the envelope reports the failure');
  eq(verified.evidenceMatches, true, 'over evidence it genuinely covers');
  eq(verified.contract.outcome, 'VERIFIED', 'while the contract itself remains valid');
});

await check('THE COMPLETE CHAIN: nobody picked the judge, nobody picked the exam', async () => {
  // Everything above starts from a contract someone composed by hand. This one
  // starts from a draw. It is the whole design in a single run:
  //
  //   committed panel + committed bank + a beacon nobody owns
  //     -> checker drawn, criteria drawn, contract assembled
  //     -> doer signs a contract it did not compose
  //     -> agent loop runs, staged judge escalates
  //     -> independent checker signs a verdict
  //     -> envelope verifies offline, for a stranger holding none of it
  const extraCheckers = await Promise.all([0, 1, 2, 3].map(() => generateKeyPair()));
  const candidates = [
    { did: checker.did, qualification: { tier: 3, badges: ['code-review'] } },
    ...extraCheckers.map((k) => ({ did: k.did, qualification: { tier: 3, badges: ['code-review'] } })),
    // The doer is in the panel and the best qualified. It must still never be drawn.
    { did: doer.did, qualification: { tier: 5, badges: ['code-review'] } },
  ];
  const keyFor = new Map([[checker.did, checker], ...extraCheckers.map((k) => [k.did, k])]);
  const requirement = { minTier: 2, requiredBadges: ['code-review'] };
  const bank = Array.from({ length: 8 }, (_, i) => ({
    id: `b${i}`, statement: `bank criterion ${i}`, minScore: 0.9,
  }));

  const assigned = await assembleAssignedContract({
    taskId: 'spine-assigned',
    doerDid: doer.did,
    deliverable: 'a working thing',
    requirement,
    nonce: 'spine',
    beacon: 'drand:round:31337',
    candidates,
    bank,
    criteriaCount: 2,
    proposedAt: '2026-08-15T00:00:00.000Z',
  });

  // SMOKE CHECK ONLY, and worth saying so: this is one draw from a panel of
  // five, so it catches a broken doer-exclusion about one time in six.
  // Removing the exclusion leaves THIS suite green [mutation-tested]. The
  // property is enforced and killed properly in check:checker-assignment
  // (explicit exclusion assertion) and check:assigned-contract (40 beacons).
  truthy(assigned.unsigned.checkerDid !== doer.did, 'the doer must not be its own judge (smoke)');
  const pool = eligiblePool({ candidates, requirement, doerDid: doer.did }).pool;
  const assemblyOk = await verifyAssignedContract({
    unsigned: assigned.unsigned, assignment: assigned.assignment,
    criteriaProof: assigned.criteriaProof, pool, bank,
  });
  eq(assemblyOk.outcome, 'VERIFIED', 'the assembly must be checkable before anyone signs it');

  const drawnKey = keyFor.get(assigned.unsigned.checkerDid);
  truthy(drawnKey, 'the drawn checker must be one the harness can act as');

  const { doerSignature } = await proposeContract({ unsigned: assigned.unsigned, doerKey: doer.privateKey });
  const contract = await countersignContract({
    unsigned: assigned.unsigned, doerSignature, checkerKey: drawnKey.privateKey,
  });

  const staged = createStagedJudge({
    tiers: [
      { name: 'mechanical', judge: { async judge() { return { outcome: 'NOT_CHECKED', detail: 'no command' }; } } },
      { name: 'panel', judge: { async judge() { return { outcome: 'VERIFIED', score: 0.97, detail: 'judged' }; } } },
    ],
  });
  const evaluator = createContractedEvaluator({
    contract, checkerKey: drawnKey.privateKey, judge: staged.judge,
    now: () => new Date('2026-08-15T02:00:00.000Z'),
  });

  const result = await runAgentLoop({
    taskId: 'spine-assigned',
    policy: {
      maxIterations: 3, noProgressAbortAfter: 3, toolsAllowed: ['run_tests'],
      irreversibleRequiresHuman: [], untrustedOutputSources: [],
      maxWritesPerSession: 0, toolEffects: { run_tests: 'read' },
    },
    model: {
      calls: 0,
      async turn() {
        this.calls += 1;
        if (this.calls === 1) return { calls: [{ id: 'a', name: 'run_tests', args: {} }] };
        return { calls: [], handoff: { outcome: 'VERIFIED', summary: 'done', evidence: [] } };
      },
    },
    tools: { async call() { return { content: '42 passed' }; } },
    authorizer: { async authorize() { return { allowed: true, reason: 'read-only' }; } },
    evaluator,
    criteria: assigned.unsigned.criteria,
    doerDid: doer.did,
    clock: new ManualClock(1000),
  });

  eq(result.outcome, 'VERIFIED', 'the judged run must stand');
  eq(result.evaluation.independent, true, 'and the kernel must see an independent checker');

  const envelope = await packEnvelope({ contract, verdict: result.evaluation.evaluation.verdict });
  const stranger = await verifyEnvelope({
    envelope: JSON.parse(JSON.stringify(envelope)),
    evidence: result.turns,
  });
  eq(stranger.outcome, 'VERIFIED', 'a stranger holding none of our infrastructure must verify it');
  eq(stranger.evidenceMatches, true, 'over the evidence the run actually produced');
  eq(stranger.checkerDid, assigned.unsigned.checkerDid, 'and the checker they see is the one drawn');
});

rmSync(outDir, { recursive: true, force: true });

console.log(`\nspine-e2e: ${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}
console.log('All spine-e2e checks passed.');
