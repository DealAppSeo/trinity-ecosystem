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
import { barrelText } from './lib/barrel-text.mjs';

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

// TWO files since 2026-08-19: `index.ts` is `export * from './portable'` plus
// the host adapters. Every spine module moved to portable.ts and stayed exactly
// as reachable from '@/lib/trustshell' — reading index.ts alone reported all
// eleven as unreachable, which was the measurement breaking, not the property.
const barrel = barrelText('lib/trustshell/index.ts');
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

const { runContractedWork, runAcceptedWork } = spine;
const { generateKeyPair } = did;
const { ManualClock } = types;

truthy(typeof runContractedWork === 'function', 'the shipped composition must be callable');
truthy(typeof runAcceptedWork === 'function', 'the shipped acceptance loop must be callable');

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

// ---------------------------------------------------------------------------
// D. The auditor grant, on the live path.
//
// `auditor-grant.ts` had zero importers. It is now minted BY the spine for the
// DRAWN checker, and — the part that matters — analysed against
// `execution.policy.toolEffects`, the very map the loop enforces. A grant
// checked against some other effect map would verify perfectly and prove
// nothing about the run it accompanies.
// ---------------------------------------------------------------------------

const idm = await import(pathToFileURL(join(outDir, 'trustshell', 'identity', 'identity.js')).href);
const cpm = await import(
  pathToFileURL(join(outDir, 'trustshell', 'identity', 'control-proof.js')).href
);

const mkId = (n) => idm.createAgentIdentity(n, { exportable: true });
const human = await mkId('human');
const operator = await mkId('operator');
const idDoer = await mkId('doer');
const idCheckers = await Promise.all(['c0', 'c1', 'c2', 'c3', 'c4'].map((n) => mkId(n)));
const idFor = new Map(idCheckers.map((k) => [k.did, k]));

const parentProof = await cpm.issueControlProof({
  human,
  agent: operator,
  audience: 'spine-reachable',
  capabilities: ['test:*'],
  ttlSeconds: 3600,
});

const idCandidates = [
  ...idCheckers.map((k) => ({ did: k.did, qualification: { tier: 3, badges: ['code-review'] } })),
  { did: idDoer.did, qualification: { tier: 5, badges: ['code-review'] } },
];

function grantAssignment(taskId) {
  return { ...assignmentFor(taskId), doerDid: idDoer.did, candidates: idCandidates };
}

const READ_ONLY_CAPS = {
  parent: parentProof,
  delegator: operator,
  auditorIdentityFor: (d) => idFor.get(d),
  capabilities: ['test:*'],
  toolCapabilities: { run_tests: 'test:run' },
  ttlSeconds: 600,
};

function grantRun(taskId, over = {}, execOver = {}) {
  const ex = execution();
  return runContractedWork({
    assignment: grantAssignment(taskId),
    doerKey: idDoer.privateKey,
    checkerKeyFor: (d) => idFor.get(d)?.privateKey,
    tiers: TIERS,
    execution: { ...ex, policy: { ...ex.policy, ...execOver } },
    auditorGrant: { ...READ_ONLY_CAPS, ...over },
    now: () => new Date('2026-08-16T02:00:00.000Z'),
    observedAt: '2026-08-16T02:00:00.000Z',
  });
}

await check('the auditor grant is MINTED for the drawn checker and bound into the verdict', async () => {
  const out = await grantRun('grant-happy');

  truthy(out.auditorGrant, 'a grant must be minted');
  eq(out.auditorGrant.analysis.readOnly, true, 'and it must be PROVABLY read-only');
  eq(
    out.auditorGrant.proof.grant.delegateDid,
    out.assigned.unsigned.checkerDid,
    'the grant must name the DRAWN checker, not some other auditor'
  );
  truthy(out.auditorGrant.proof.grant.delegateDid !== idDoer.did, 'and never the doer');

  // The binding is the point: the verdict carries a reference to the authority
  // under which it was rendered, so a third party can ask what the judge could
  // touch instead of taking our word for it.
  eq(
    out.verdict?.controlProofRef,
    out.auditorGrant.proof.delegateSignature,
    'the signed verdict must reference the grant it was rendered under'
  );
});

await check('REFUSAL: the grant reaches a WRITE tool in the LOOP\'S OWN effect map', async () => {
  // Nothing changes about the capability set. The only change is that the LOOP
  // now declares a write tool — and because the grant is analysed against the
  // loop's map, that alone must make minting refuse. This is the assertion that
  // proves the two maps are genuinely the same map.
  await refuses(
    () =>
      grantRun(
        'grant-write',
        { toolCapabilities: { run_tests: 'test:run', deploy: 'test:deploy' } },
        { toolEffects: { run_tests: 'read', deploy: 'write' } }
      ),
    'not provably read-only',
    'a capability set reaching a write tool must not mint'
  );
});

await check('REFUSAL: a tool the effect map does not classify counts as a write', async () => {
  // `deploy` is reachable but absent from the loop's toolEffects. An unlabelled
  // tool is a blast radius nobody measured, so it blocks the grant rather than
  // being assumed safe.
  await refuses(
    () =>
      grantRun(
        'grant-unclassified',
        { toolCapabilities: { run_tests: 'test:run', deploy: 'test:deploy' } },
        { toolEffects: { run_tests: 'read' } }
      ),
    'not provably read-only',
    'an unclassified reachable tool must not mint'
  );
});

await check('REFUSAL: no identity for the drawn checker', async () => {
  await refuses(
    () => grantRun('grant-noid', { auditorIdentityFor: () => undefined }),
    'no identity for the drawn checker',
    'minting under a different agent\'s identity must be refused, never substituted'
  );
});

await check('the grant is OPTIONAL, and its absence is honest', async () => {
  // Omitting it leaves `controlProofRef` undefined, which the contracted
  // evaluator records as an UNVERIFIED authority — never as an authorized one.
  const out = await runContractedWork({
    assignment: grantAssignment('grant-absent'),
    doerKey: idDoer.privateKey,
    checkerKeyFor: (d) => idFor.get(d)?.privateKey,
    tiers: TIERS,
    execution: execution(),
    now: () => new Date('2026-08-16T02:00:00.000Z'),
    observedAt: '2026-08-16T02:00:00.000Z',
  });
  eq(out.auditorGrant, undefined, 'no grant when none was requested');
  eq(out.verdict?.controlProofRef, undefined, 'and no authority is claimed');
  eq(out.loop.outcome, 'VERIFIED', 'the run still completes — the grant is additive');
});

rmSync(outDir, { recursive: true, force: true });

// ─── C. DOES THE ACCEPTANCE LOOP FIRE ────────────────────────────────────────
//
// The unit suite asserts the decision logic against fixtures. These drive the
// SHIPPED composition, because the wiring is where a correct decision module
// gets connected to the wrong field — and reading cannot tell you that.

/** A reviewer that rejects until the doer has produced `acceptFrom` attempts. */
function reviewerAcceptingFrom(acceptFrom, state) {
  return [
    {
      name: 'reviewer',
      judge: {
        async judge() {
          return state.attempt >= acceptFrom
            ? { outcome: 'VERIFIED', score: 0.95, detail: 'to spec' }
            : { outcome: 'FAILED', detail: 'not to spec' };
        },
      },
    },
  ];
}

await check('THE ACCEPTANCE LOOP FIRES: rejected twice, then signed off', async () => {
  const state = { attempt: 0 };
  const assignment = assignmentFor('acceptance-revises');

  const out = await runAcceptedWork({
    assignment,
    doerKey: doer.privateKey,
    checkerKeyFor: (d) => keyFor.get(d),
    tiers: reviewerAcceptingFrom(3, state),
    now: () => new Date('2026-08-16T02:00:00.000Z'),
    observedAt: '2026-08-16T02:00:00.000Z',
    attempt: ({ round }) => {
      state.attempt = round + 1;
      return { execution: execution(), submissionDigest: `sha256:v${round + 1}` };
    },
  });

  eq(out.state.status, 'ACCEPTED', 'the third attempt must be signed off');
  eq(out.rounds.length, 3, 'three rounds must have run');
  eq(out.rounds[0].verdict, 'REJECTED', 'the first attempt is rejected');
  eq(out.rounds[1].verdict, 'REJECTED', 'the second attempt is rejected');
  eq(out.rounds[2].verdict, 'ACCEPTED', 'the third is accepted');
  truthy(out.delivered, 'an accepted run must hand back the delivered attempt');
  truthy(out.delivered.envelope, 'and the delivered attempt carries its portable envelope');

  // THE INVARIANT THIS WHOLE DESIGN RESTS ON. Three rounds, one auditor. If the
  // assignment is stable the draw is stable, and the doer never got to reroll.
  const auditors = new Set(out.rounds.map((r) => r.auditorDid));
  eq(auditors.size, 1, 'the drawn auditor must be identical across every revision');
  truthy(!auditors.has(doer.did), 'and it is still never the doer');
});

await check('EXHAUSTED is not a delivery', async () => {
  const state = { attempt: 0 };

  const out = await runAcceptedWork({
    assignment: assignmentFor('acceptance-exhausts'),
    doerKey: doer.privateKey,
    checkerKeyFor: (d) => keyFor.get(d),
    // Never accepts, however many times the doer revises.
    tiers: reviewerAcceptingFrom(Number.MAX_SAFE_INTEGER, state),
    now: () => new Date('2026-08-16T02:00:00.000Z'),
    observedAt: '2026-08-16T02:00:00.000Z',
    policy: { maxRejections: 3 },
    attempt: ({ round }) => ({
      execution: execution(),
      submissionDigest: `sha256:v${round + 1}`,
    }),
  });

  eq(out.state.status, 'EXHAUSTED', 'a budget that runs out is EXHAUSTED');
  eq(out.rounds.length, 3, 'and it stops at the bound rather than looping forever');
  eq(out.delivered, undefined, 'EXHAUSTED must hand back NO deliverable');
  truthy(out.attempts.length === 3, 'every attempt is retained as evidence');
});

await check('STALLED: resubmitting identical bytes is not a revision', async () => {
  const state = { attempt: 0 };

  const out = await runAcceptedWork({
    assignment: assignmentFor('acceptance-stalls'),
    doerKey: doer.privateKey,
    checkerKeyFor: (d) => keyFor.get(d),
    tiers: reviewerAcceptingFrom(Number.MAX_SAFE_INTEGER, state),
    now: () => new Date('2026-08-16T02:00:00.000Z'),
    observedAt: '2026-08-16T02:00:00.000Z',
    policy: { maxRejections: 5 },
    // A doer that never changes anything.
    attempt: () => ({ execution: execution(), submissionDigest: 'sha256:unchanged' }),
  });

  eq(out.state.status, 'STALLED', 'identical bytes twice rejected is STALLED');
  eq(out.rounds.length, 2, 'and it stops immediately rather than burning the budget');
  eq(out.delivered, undefined, 'STALLED must hand back NO deliverable');
});

console.log(`\nspine-reachable: ${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}
console.log('All spine-reachable checks passed.');
