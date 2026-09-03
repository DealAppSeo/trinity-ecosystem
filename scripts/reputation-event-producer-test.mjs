// scripts/reputation-event-producer-test.mjs — Stage B, the missing producer.
//
// Drives the REAL producer (lib/trustshell/identity/reputation-event-producer.ts)
// against the REAL transition machinery, with a SHA-256 stand-in scheme (the same
// toyScheme check-identity uses — real enough to exercise the plumbing, honest
// about not being Poseidon2). Asserts the ratified Stage-B properties:
//
//   * outcome -> committed transition: newRoot = H(prevRoot ‖ eventCommitment),
//     and verifyTransitionByRecomputation accepts it;
//   * NO SELF-REPORT: an event about the doer is REFUSED through this path;
//   * one append per (subject, epoch): two events under one scope derive the SAME
//     nullifier — which is WHY a durable spent set is mandatory (and deferred);
//   * every declared statement field is load-bearing (LESSONS A13 discipline);
//   * a PENDING scheme is not faked — it throws.
//
// Exit 0 VERIFIED, 1 a property regressed, 2 NOT_CHECKED (could not build).

import { compileAndImport } from './redteam/compile.mjs';

const FILES = [
  'lib/trustshell/identity/nullifier.ts',
  'lib/trustshell/identity/reputation-transition.ts',
  'lib/trustshell/identity/reputation-event-producer.ts',
];
const c = await compileAndImport(FILES, [
  'lib/trustshell/identity/reputation-event-producer.ts',
  'lib/trustshell/identity/reputation-transition.ts',
  'lib/trustshell/identity/nullifier.ts',
]);
if (!c.ok) {
  console.error(`check:reputation-producer — NOT_CHECKED: could not build the producer: ${c.reason}`);
  process.exit(2);
}
const [PROD, TRANS, NUL] = c.modules;
const { produceTransitions, InMemoryHeadRootStore } = PROD;
const { commitEvent, appendEvent, scopeForSubject, verifyTransitionByRecomputation, GENESIS_ROOT } = TRANS;
const { buildGroup, PendingPoseidon2Scheme } = NUL;

let passed = 0;
const failures = [];
async function check(name, fn) {
  try {
    await fn();
    passed++;
  } catch (e) {
    failures.push(name);
    console.log(`  FAIL  ${name} — ${e.message}`);
  }
}
const eq = (a, b, m) => {
  if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};
const truthy = (v, m) => {
  if (!v) throw new Error(`${m}: expected truthy, got ${JSON.stringify(v)}`);
};
async function refuses(fn, mustMention, m) {
  let threw = null;
  try {
    await fn();
  } catch (e) {
    threw = e;
  }
  if (!threw) throw new Error(`${m}: expected a refusal, got none`);
  if (!threw.message.includes(mustMention)) throw new Error(`${m}: refused, but message never mentions "${mustMention}": ${threw.message}`);
}

// A SHA-256 stand-in — declares parametersKnown:false (it is NOT Poseidon2) but
// computes, so the statement/witness plumbing is testable before the real params.
const toyDigest = async (...parts) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parts.join('')));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
};
const toyScheme = {
  scheme: 'poseidon2-v1-PENDING-PARAMETERS',
  parametersKnown: false,
  commit: async (s) => toyDigest('toy:commit', s),
  nullify: async (s, d, sc) => toyDigest('toy:null', s, d, sc),
  hashPair: async (l, r) => toyDigest('toy:node', l, r),
};

const CHECKER = 'did:checker';
const DOER = 'did:doer';
const EPOCH = 'task-1';

async function mkWriter() {
  const secrets = ['w1', 'w2', 'w3', 'w4'];
  const commitments = await Promise.all(secrets.map((s) => toyScheme.commit(s)));
  const group = await buildGroup(commitments, toyScheme);
  return { secret: 'w1', groupRoot: group.root, membership: group.pathFor(commitments[0]), domain: 'trinity' };
}
const ev = (over = {}) => ({ subject: CHECKER, signal: 'veritas_catch', observedAt: '2026-09-01T00:00:00.000Z', ...over });

await check('empty events produce nothing — the common case', async () => {
  const writer = await mkWriter();
  const out = await produceTransitions({ events: [], writer, scheme: toyScheme, headRootStore: new InMemoryHeadRootStore(), epoch: EPOCH, doerDid: DOER });
  eq(out.length, 0, 'no events, no transitions');
});

await check('one event becomes a valid, chained transition', async () => {
  const writer = await mkWriter();
  const store = new InMemoryHeadRootStore();
  const out = await produceTransitions({ events: [ev()], writer, scheme: toyScheme, headRootStore: store, epoch: EPOCH, doerDid: DOER });
  eq(out.length, 1, 'one transition');
  eq(out[0].verification.valid, true, 'the transition recomputes as valid');
  // newRoot = H(GENESIS ‖ eventCommitment), computed the same way the module does.
  const commitment = await commitEvent(ev(), toyScheme);
  const expected = await appendEvent(GENESIS_ROOT, commitment, toyScheme);
  eq(out[0].newRoot, expected, 'newRoot extends GENESIS by exactly this event');
  eq(out[0].statement.publicInputs.prevRoot, GENESIS_ROOT, 'the first append starts from GENESIS');
  // nullifier reopens against the writer + scope.
  const scope = scopeForSubject(CHECKER, EPOCH);
  const nul = await toyScheme.nullify('w1', 'trinity', scope);
  eq(out[0].nullifier, nul, 'the nullifier is scoped to (subject, epoch) and the writer secret');
  eq(await store.headFor(CHECKER), out[0].newRoot, 'a valid transition advances the verifier-held head');
});

await check('the parametersKnown flag rides on the result — a stand-in root is refusable downstream', async () => {
  const writer = await mkWriter();
  const out = await produceTransitions({ events: [ev()], writer, scheme: toyScheme, headRootStore: new InMemoryHeadRootStore(), epoch: EPOCH, doerDid: DOER });
  eq(out[0].parametersKnown, false, 'a SHA-256 stand-in is flagged so a durable store can refuse to persist its root');
});

await check('NO SELF-REPORT: an event about the doer is refused through the verdict path', async () => {
  const writer = await mkWriter();
  await refuses(
    () => produceTransitions({ events: [ev({ subject: DOER })], writer, scheme: toyScheme, headRootStore: new InMemoryHeadRootStore(), epoch: EPOCH, doerDid: DOER }),
    'self-report',
    'a reputation event about the doer must be refused'
  );
});

await check('one append per (subject, epoch): two events under one scope collide on the nullifier', async () => {
  const writer = await mkWriter();
  const store = new InMemoryHeadRootStore();
  const out = await produceTransitions({ events: [ev(), ev({ observedAt: '2026-09-02T00:00:00.000Z' })], writer, scheme: toyScheme, headRootStore: store, epoch: EPOCH, doerDid: DOER });
  eq(out.length, 2, 'both events were processed');
  eq(out[0].nullifier, out[1].nullifier, 'same (subject, epoch) -> same nullifier — a durable spent set MUST reject the second');
});

await check('different subjects get independent chains from GENESIS', async () => {
  const writer = await mkWriter();
  const store = new InMemoryHeadRootStore();
  const other = 'did:checker-2';
  const out = await produceTransitions({ events: [ev(), ev({ subject: other })], writer, scheme: toyScheme, headRootStore: store, epoch: EPOCH, doerDid: DOER });
  eq(out[0].statement.publicInputs.prevRoot, GENESIS_ROOT, 'subject 1 starts from GENESIS');
  eq(out[1].statement.publicInputs.prevRoot, GENESIS_ROOT, 'subject 2 starts from its OWN GENESIS, not subject 1s head');
  truthy(out[0].newRoot !== out[1].newRoot, 'and the two histories are distinct');
});

await check('every declared statement field is load-bearing (A13 discipline)', async () => {
  const writer = await mkWriter();
  const out = await produceTransitions({ events: [ev()], writer, scheme: toyScheme, headRootStore: new InMemoryHeadRootStore(), epoch: EPOCH, doerDid: DOER });
  const good = out[0].statement;
  // Tamper each field and confirm recomputation rejects it.
  const tampers = [
    { path: ['publicInputs', 'newRoot'], to: 'zzz' },
    { path: ['publicInputs', 'nullifier'], to: 'zzz' },
    { path: ['publicInputs', 'groupRoot'], to: 'zzz' },
    { path: ['publicInputs', 'scope'], to: scopeForSubject(CHECKER, 'other-epoch') },
    { path: ['privateWitness', 'secret'], to: 'not-a-member' },
    { path: ['privateWitness', 'eventCommitment'], to: 'zzz' },
  ];
  for (const t of tampers) {
    const s = JSON.parse(JSON.stringify(good));
    s[t.path[0]][t.path[1]] = t.to;
    const v = await verifyTransitionByRecomputation(s, toyScheme);
    eq(v.valid, false, `tampering ${t.path.join('.')} must make recomputation reject`);
  }
});

await check('a PENDING scheme is not faked — it throws', async () => {
  const writer = await mkWriter();
  await refuses(
    () => produceTransitions({ events: [ev()], writer, scheme: new PendingPoseidon2Scheme(), headRootStore: new InMemoryHeadRootStore(), epoch: EPOCH, doerDid: DOER }),
    'Poseidon2',
    'production under a scheme with no parameters must throw, never emit a fabricated root'
  );
});

console.log(`\ncheck:reputation-producer — ${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
console.log('check:reputation-producer — VERIFIED');
process.exit(0);
