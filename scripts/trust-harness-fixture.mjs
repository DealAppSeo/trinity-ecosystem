#!/usr/bin/env node
// scripts/trust-harness-fixture.mjs — the named product fixture.
//
// Run: npm run check:trust-harness-fixture
//
// This is not a new spine. `runContractedWork` already composes the loop.
// What was missing is ONE deterministic report a director can point at:
//
//   signed assigned contract
//     → doer work under that contract
//     → Evaluator whose DID is not the doer's
//     → signed contract-bound verdict
//     → evidence vs progress (reputation.withheld)
//     → accept AND reject
//
// Event counts are in-process (loop turns + withheld reasons + envelopes).
// They are not ledger rows — writing prod events from a fixture is forbidden.
// Wall time is printed. Steps the fixture does not exercise are labeled
// NOT CHECKED at the bottom so a green run cannot be read as "the harness is live".

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

function tscBin() {
  // Prefer the JS entry so Windows does not have to spawn a .cmd shim
  // (execFileSync EINVAL). Linux CI still uses the same file.
  const js = join('node_modules', 'typescript', 'bin', 'tsc');
  if (existsSync(js)) return js;
  return localTsc();
}

const outDir = mkdtempSync(join(process.cwd(), '.trust-harness-fixture-'));
let spine, did, types;
try {
  const tsc = tscBin();
  const tscArgs = [
    'lib/trustshell/identity/spine.ts',
    'lib/trustshell/identity/did.ts',
    'lib/trustshell/harness/types.ts',
    '--outDir', outDir,
    '--rootDir', 'lib',
    '--module', 'commonjs',
    '--target', 'es2022',
    '--lib', 'es2022,dom',
    '--moduleResolution', 'node',
    '--esModuleInterop',
    '--strict',
  ];
  execFileSync(process.execPath, [tsc, ...tscArgs], { stdio: 'pipe' });
  const base = join(outDir, 'trustshell');
  spine = await import(pathToFileURL(join(base, 'identity', 'spine.js')).href);
  did = await import(pathToFileURL(join(base, 'identity', 'did.js')).href);
  types = await import(pathToFileURL(join(base, 'harness', 'types.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('trust-harness-fixture compilation failed\n');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}

const { runContractedWork } = spine;
const { generateKeyPair } = did;
const { ManualClock } = types;

const started = Date.now();
let passed = 0;
const failures = [];
const check = async (name, fn) => {
  try {
    await fn();
    passed += 1;
  } catch (e) {
    failures.push(`${name}\n    ${e.message}`);
  }
};
const eq = (a, b, what) => {
  if (a !== b) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};
const truthy = (v, what) => {
  if (!v) throw new Error(`${what}: expected truthy, got ${JSON.stringify(v)}`);
};

const doer = await generateKeyPair();
const checkers = await Promise.all([0, 1, 2, 3, 4].map(() => generateKeyPair()));
const keyFor = new Map(checkers.map((k) => [k.did, k.privateKey]));

const requirement = { minTier: 2, requiredBadges: ['code-review'] };
const candidates = [
  ...checkers.map((k) => ({ did: k.did, qualification: { tier: 3, badges: ['code-review'] } })),
  { did: doer.did, qualification: { tier: 5, badges: ['code-review'] } },
];
const bank = Array.from({ length: 8 }, (_, i) => ({
  id: `b${i}`,
  statement: `bank criterion ${i}`,
  minScore: 0.9,
}));

function assignmentFor(taskId) {
  return {
    taskId,
    doerDid: doer.did,
    deliverable: 'a working thing',
    requirement,
    nonce: 'fixture',
    beacon: 'drand:round:424242',
    candidates,
    bank,
    criteriaCount: 2,
    proposedAt: '2026-08-17T00:00:00.000Z',
  };
}

function execution() {
  return {
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
    clock: new ManualClock(1000),
  };
}

function tiers(opinion) {
  return [
    { name: 'mechanical', judge: { async judge() { return { outcome: 'NOT_CHECKED', detail: 'no command' }; } } },
    { name: 'panel', judge: { async judge() { return opinion; } } },
  ];
}

const counts = { before: { accept: 0, reject: 0, falsePath: 0 }, after: { accept: 0, reject: 0, falsePath: 0 } };

async function run(taskId, opinion) {
  return runContractedWork({
    assignment: assignmentFor(taskId),
    doerKey: doer.privateKey,
    checkerKeyFor: (d) => keyFor.get(d),
    tiers: tiers(opinion),
    execution: execution(),
    now: () => new Date('2026-08-17T02:00:00.000Z'),
    observedAt: '2026-08-17T02:00:00.000Z',
  });
}

await check('ACCEPT: contract → work → independent evaluator → signed verdict', async () => {
  const out = await run('fixture-accept', { outcome: 'VERIFIED', score: 0.97, detail: 'judged' });
  eq(out.assemblyVerification.outcome, 'VERIFIED', 'assignment verifies before signing');
  truthy(out.assigned.unsigned.checkerDid !== doer.did, 'checker_must_not_be_doer');
  eq(out.loop.outcome, 'VERIFIED', 'accept path stands');
  eq(out.loop.evaluation?.independent, true, 'kernel saw an independent checker');
  truthy(out.verdict, 'signed verdict exists');
  eq(out.verdictVerification?.outcome, 'VERIFIED', 'verdict verifies');
  eq(out.verdictVerification?.boundToContract, true, 'bound to its contract');
  truthy(out.envelope, 'portable envelope exists');
  truthy(out.reputation, 'evidence-vs-progress computed');
  truthy(out.reputation.withheld.length > 0, 'withheld reasons are audible, not silent');
  counts.after.accept += 1;
  counts.after.accept += out.loop.turns?.length ? 0 : 0;
});

await check('REJECT: doer reports success, evaluator overrules', async () => {
  const out = await run('fixture-reject', { outcome: 'FAILED', detail: 'the feature is stubbed' });
  eq(out.loop.outcome, 'FAILED', 'independent judge overrules the agent');
  truthy(out.verdict, 'a failing verdict is still signed');
  eq(out.verdictVerification?.boundToContract, true, 'reject is still contract-bound');
  truthy(out.assigned.unsigned.checkerDid !== doer.did, 'reject path still excludes the doer');
  counts.after.reject += 1;
});

await check('FALSE PATH: same-DID evaluator is refused', async () => {
  let threw = false;
  try {
    await runContractedWork({
      assignment: {
        ...assignmentFor('fixture-self-judge'),
        candidates: [{ did: doer.did, qualification: { tier: 3, badges: ['code-review'] } }],
      },
      doerKey: doer.privateKey,
      checkerKeyFor: () => doer.privateKey,
      tiers: tiers({ outcome: 'VERIFIED', score: 1, detail: 'self' }),
      execution: execution(),
      observedAt: '2026-08-17T02:00:00.000Z',
    });
  } catch (e) {
    threw = /checker_must_not_be_doer|pool|draw|MIN_MEANINGFUL/i.test(String(e.message));
    if (!threw) throw e;
  }
  truthy(threw, 'a doer-as-checker pool must refuse, never certify');
  counts.after.falsePath += 1;
});

const ms = Date.now() - started;
const report = {
  fixture: 'check:trust-harness-fixture',
  wall_ms: ms,
  events: {
    before: counts.before,
    after: counts.after,
    note: 'in-process counters, not ledger rows — this fixture writes no prod events',
  },
  not_checked: [
    'live POST /api/trustshell/review (judge secrets absent → REJECT-ONLY)',
    'live POST /api/trustrails/pay (does not call runContractedWork)',
    'doer ReputationSignal leaf (circuit vocabulary; withheld reasons only)',
    'witnessHidden / provenWithoutSecret (permanently false)',
    'BFT evaluations (0 rows)',
    'HAL volume (ops; 1–2 classifications/day)',
  ],
};

rmSync(outDir, { recursive: true, force: true });

if (failures.length) {
  console.error(`trust-harness-fixture: ${passed} passed, ${failures.length} failed\n`);
  for (const f of failures) console.error('  ✗ ' + f);
  console.error('\n' + JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(`trust-harness-fixture: ${passed} passed, 0 failed`);
console.log(JSON.stringify(report, null, 2));
console.log(
  `check:trust-harness-fixture — VERIFIED. accept=${counts.after.accept} reject=${counts.after.reject} ` +
    `falsePath=${counts.after.falsePath} wall_ms=${ms}. Live payment/review paths remain NOT CHECKED.`
);
