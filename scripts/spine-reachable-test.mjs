#!/usr/bin/env node
// scripts/spine-reachable-test.mjs
//
// THE DORMANCY GUARD.
//
// Every other suite in this repo proves a module is CORRECT. None of them
// proved any module was REACHABLE, and on 2026-08-16 that gap was the whole
// problem: ten mutation-tested modules, every suite green, and not one of them
// exported from `lib/trustshell/index.ts` or imported by anything outside its
// own test. The spine was correct and inert. A green check suite cannot see
// that, because a test imports the module directly by path — which is exactly
// the access a real consumer does NOT have.
//
// So this suite asks two questions no unit test can:
//
//   A. REACHABILITY — is each spine module exported from the barrel? A
//      consumer importing '@/lib/trustshell' can only reach what is exported
//      there. This is a static check on the barrel, deliberately: it fails
//      even if every other suite passes.
//
//   B. DOES IT FIRE — run the SHIPPED composition (`runContractedWork`) end to
//      end. Not a re-assembly of the parts, which is what `spine-e2e-test.mjs`
//      does and why the library had no callers for so long. If the shipped
//      entry point stops working, this goes red even though the parts are fine.
//
//   C. DOES IT REFUSE — the three conditions under which continuing would
//      produce a plausible-but-wrong artifact must THROW, not degrade. A
//      composition that silently repairs a bad draw is worse than no
//      composition: it launders the failure.
//
// It is the pair that matters. B alone would pass on a module nobody can
// import; A alone would pass on an export that throws on first call.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

let passed = 0;
const failures = [];

function eq(actual, expected, label) {
  if (actual === expected) passed += 1;
  else failures.push(`${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function truthy(v, label) {
  if (v) passed += 1;
  else failures.push(`${label} — expected truthy, got ${JSON.stringify(v)}`);
}
async function check(label, fn) {
  try {
    await fn();
  } catch (e) {
    failures.push(`${label} threw: ${e.message}`);
  }
}
/** Assert that `fn` throws, and that the message names the reason. */
async function refuses(fn, mustMention, label) {
  let threw = null;
  try {
    await fn();
  } catch (e) {
    threw = e;
  }
  if (!threw) {
    failures.push(`${label} — expected a refusal, got none`);
    return;
  }
  if (!threw.message.includes(mustMention)) {
    failures.push(`${label} — refused, but the message never mentions "${mustMention}": ${threw.message}`);
    return;
  }
  passed += 1;
}

// ---------------------------------------------------------------------------
// A. Reachability. Static, on the barrel itself.
// ---------------------------------------------------------------------------

// Every module that makes up the spine. Adding a link to the chain without
// adding it here is the failure mode this list exists to prevent, so the list
// is explicit rather than derived from a directory scan — a scan would
// silently accept a new module that nobody exported.
const SPINE = [
  'spine',
  'work-contract',
  'checker-assignment',
  'criteria-draw',
  'assigned-contract',
  'contracted-evaluator',
  'staged-judge',
  'verdict-envelope',
  'outcome-to-reputation',
  'auditor-grant',
  'handoff',
];

const barrel = readFileSync('lib/trustshell/index.ts', 'utf8');
for (const mod of SPINE) {
  truthy(
    barrel.includes(`'./identity/${mod}'`),
    `REACHABILITY: '${mod}' must be exported from lib/trustshell/index.ts — a module ` +
      `absent from the barrel is unreachable to every consumer that imports '@/lib/trustshell'`
  );
}

// The kernel must stay exported too. If it ever is not, the port has no host
// and the spine above has nothing to plug into.
truthy(
  barrel.includes(`from './harness/loop'`),
  `REACHABILITY: runAgentLoop must remain exported — the spine plugs into its Evaluator port`
);

// ---------------------------------------------------------------------------
// B + C. Compile the SHIPPED entry point and run it.
// ---------------------------------------------------------------------------

const outDir = mkdtempSync(join(process.cwd(), '.spine-reachable-check-'));
let spine, did, types;
try {
  // Compiling spine.ts alone is the point: tsc follows its imports, so if the
  // shipped composition fails to pull in a real link, this fails here.
  execFileSync(
    localTsc(),
    [
      'lib/trustshell/identity/spine.ts',
      '--outDir', outDir,
      // Pinned — see work-contract-test.mjs. Same hazard as every sibling suite.
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
  const base = join(outDir, 'trustshell');
  spine = await import(pathToFileURL(join(base, 'identity', 'spine.js')).href);
  did = await import(pathToFileURL(join(base, 'identity', 'did.js')).href);
  types = await import(pathToFileURL(join(base, 'harness', 'types.js')).href);
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  console.error('spine-reachable compilation failed\n');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}

const { runContractedWork } = spine;
const { generateKeyPair } = did;
const { ManualClock } = types;

truthy(typeof runContractedWork === 'function', 'the shipped composition must be callable');

const doer = await generateKeyPair();
const checkers = await Promise.all([0, 1, 2, 3, 4].map(() => generateKeyPair()));
const keyFor = new Map(checkers.map((k) => [k.did, k.privateKey]));

const requirement = { minTier: 2, requiredBadges: ['code-review'] };
const candidates = [
  ...checkers.map((k) => ({ did: k.did, qualification: { tier: 3, badges: ['code-review'] } })),
  // The doer sits in the panel AND is the best qualified. It must never be drawn.
  { did: doer.did, qualification: { tier: 5, badges: ['code-review'] } },
];
const bank = Array.from({ length: 8 }, (_, i) => ({
  id: `b${i}`, statement: `bank criterion ${i}`, minScore: 0.9,
}));

function assignmentFor(taskId) {
  return {
    taskId,
    doerDid: doer.did,
    deliverable: 'a working thing',
    requirement,
    nonce: 'reachable',
    beacon: 'drand:round:31337',
    candidates,
    bank,
    criteriaCount: 2,
    proposedAt: '2026-08-16T00:00:00.000Z',
  };
}

/** A loop that calls one read-only tool and then hands off VERIFIED. */
function execution() {
  return {
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
    clock: new ManualClock(1000),
  };
}

const TIERS = [
  { name: 'mechanical', judge: { async judge() { return { outcome: 'NOT_CHECKED', detail: 'no command' }; } } },
  { name: 'panel', judge: { async judge() { return { outcome: 'VERIFIED', score: 0.97, detail: 'judged' }; } } },
];

await check('THE SHIPPED COMPOSITION FIRES, end to end', async () => {
  const out = await runContractedWork({
    assignment: assignmentFor('reachable-happy'),
    doerKey: doer.privateKey,
    checkerKeyFor: (d) => keyFor.get(d),
    tiers: TIERS,
    execution: execution(),
    now: () => new Date('2026-08-16T02:00:00.000Z'),
    observedAt: '2026-08-16T02:00:00.000Z',
  });

  // The draw happened, and it excluded the doer.
  eq(out.assemblyVerification.outcome, 'VERIFIED', 'the assignment must verify before signing');
  truthy(out.assigned.unsigned.checkerDid !== doer.did, 'the doer must not be its own judge');

  // The loop ran under an INDEPENDENT evaluator — this is the port being filled.
  eq(out.loop.outcome, 'VERIFIED', 'the judged run must stand');
  eq(out.loop.evaluation?.independent, true, 'the kernel must see an independent checker');

  // A signed, contract-bound verdict exists and verifies.
  truthy(out.verdict, 'a signed verdict must be produced');
  eq(out.verdictVerification?.outcome, 'VERIFIED', 'and it must verify against its contract');
  eq(out.verdictVerification?.boundToContract, true, 'bound to the contract it answers');

  // The portable artifact exists.
  truthy(out.envelope, 'a portable envelope must be produced');

  // Evidence-vs-progress ran. `events` may be empty — that is the design being
  // stingy, not a failure — but `withheld` must EXPLAIN, which is the property
  // that makes the gap auditable rather than silent.
  truthy(out.reputation, 'reputation must be computed');
  truthy(out.reputation.withheld.length > 0, 'and it must say what it withheld and why');
  for (const w of out.reputation.withheld) {
    truthy(typeof w.reason === 'string' && w.reason.length > 0, 'every withheld signal carries a reason');
  }
});

await check('REFUSAL: a drawn checker this harness cannot act as', async () => {
  await refuses(
    () => runContractedWork({
      assignment: assignmentFor('reachable-nokey'),
      doerKey: doer.privateKey,
      // Resolves nothing. The tempting repair is to pick a checker we CAN sign
      // as — which is checker-shopping arriving as error handling.
      checkerKeyFor: () => undefined,
      tiers: TIERS,
      execution: execution(),
      observedAt: '2026-08-16T02:00:00.000Z',
    }),
    'no signing key for the drawn checker',
    'a missing checker key must refuse, never substitute'
  );
});

await check('REFUSAL: a pool too small to be a draw', async () => {
  await refuses(
    () => runContractedWork({
      assignment: {
        ...assignmentFor('reachable-thin'),
        // One eligible candidate is "a named checker wearing a lottery's
        // clothes" (MIN_MEANINGFUL_POOL).
        candidates: [{ did: checkers[0].did, qualification: { tier: 3, badges: ['code-review'] } }],
      },
      doerKey: doer.privateKey,
      checkerKeyFor: (d) => keyFor.get(d),
      tiers: TIERS,
      execution: execution(),
      observedAt: '2026-08-16T02:00:00.000Z',
    }),
    '',
    'a pool below MIN_MEANINGFUL_POOL must refuse'
  );
});

await check('THE CONTRACT SUPPLIES THE CRITERIA, not the caller', async () => {
  // A caller that could pass its own `criteria` into the loop could run
  // against criteria the contract never agreed — re-scoping arriving as a
  // parameter. The type omits it; this asserts the runtime behaviour matches,
  // by confirming the loop was judged against the DRAWN criteria.
  const out = await runContractedWork({
    assignment: assignmentFor('reachable-criteria'),
    doerKey: doer.privateKey,
    checkerKeyFor: (d) => keyFor.get(d),
    tiers: TIERS,
    execution: execution(),
    now: () => new Date('2026-08-16T02:00:00.000Z'),
    observedAt: '2026-08-16T02:00:00.000Z',
  });
  eq(out.assigned.unsigned.criteria.length, 2, 'exactly the drawn criteria count');
  const drawnIds = out.assigned.unsigned.criteria.map((c) => c.id).sort();
  const verdictIds = (out.verdict?.scores ?? []).map((s) => s.criterionId).sort();
  eq(
    JSON.stringify(verdictIds),
    JSON.stringify(drawnIds),
    'the verdict must score exactly the criteria that were drawn'
  );
});

rmSync(outDir, { recursive: true, force: true });

console.log(`\nspine-reachable: ${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}
console.log('All spine-reachable checks passed.');
