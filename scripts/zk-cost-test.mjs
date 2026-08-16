// scripts/zk-cost-test.mjs
//
// Is zk RepID fast? Answered in the only unit that survives the hash function
// we do not yet have.
//
// The production `IBindingScheme` — `PendingPoseidon2Scheme` — THROWS on all
// three methods, because Poseidon2 parameters belong to the other lane and
// inventing them is refused. So no wall-clock figure from this repo describes
// anything we will ship. What does survive is the CALL COUNT: cost is
// `count × cost(Poseidon2)`, and circuit constraints are dominated by the same
// number.
//
// THE ASSERTION THAT EARNS THIS SUITE is `O(log N)`. A verifier that rebuilds
// the root from the whole group instead of walking the path is still CORRECT,
// returns identical booleans, and passes every assertion in `check:identity`.
// It is also O(N) — at 4,096 members that is 341× the work, and in circuit
// terms the difference between a proof that fits and one that does not.
// Complexity is invisible to a functional suite. It is not invisible here.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { localTsc } from './local-tsc.mjs';

const outDir = mkdtempSync(join(process.cwd(), '.zk-cost-check-'));
let N, T, C;
try {
  execFileSync(
    localTsc(),
    [
      'lib/trustshell/identity/nullifier.ts',
      'lib/trustshell/identity/reputation-transition.ts',
      'lib/trustshell/identity/cost.ts',
      '--outDir', outDir,
      '--rootDir', 'lib',
      '--module', 'commonjs',
      '--target', 'es2022',
      '--lib', 'es2022,dom',
      '--moduleResolution', 'node',
      '--esModuleInterop',
      '--strict',
    ],
    { stdio: 'inherit' }
  );
  const p = (f) => pathToFileURL(join(outDir, 'trustshell', 'identity', f)).href;
  N = await import(p('nullifier.js'));
  T = await import(p('reputation-transition.js'));
  C = await import(p('cost.js'));
} catch (e) {
  rmSync(outDir, { recursive: true, force: true });
  throw e;
}

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
  if (!v) throw new Error(m);
};
const costEq = (actual, expected, m) => {
  for (const k of ['commit', 'nullify', 'hashPair']) {
    if (actual[k] !== expected[k])
      throw new Error(
        `${m}: ${k} expected ${expected[k]}, got ${actual[k]} ` +
          `(full: ${JSON.stringify(actual)} vs ${JSON.stringify(expected)})`
      );
  }
};

// A stand-in so the composition can run at all. Deliberately NOT presented as a
// scheme we would ship — it exists to be counted, not to be trusted.
const enc = new TextEncoder();
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const sha = async (...parts) => hex(await crypto.subtle.digest('SHA-256', enc.encode(parts.join('|'))));
const toy = {
  scheme: 'toy-counting-stand-in',
  parametersKnown: true,
  commit: async (s) => 'c:' + (await sha('leaf', s)),
  nullify: async (s, d, sc) => 'n:' + (await sha('null', s, d, sc)),
  hashPair: async (l, r) => 'h:' + (await sha('node', l, r)),
};

const SIZES = [2, 4, 8, 16, 64, 1024, 4096];

async function group(scheme, size) {
  const members = [];
  for (let i = 0; i < size; i++) members.push(await scheme.commit('m' + i));
  const g = await N.buildGroup(members, scheme);
  return { members, g, path: g.pathFor(members[0]) };
}

// ── 1. the blocker is real, and stated ──────────────────────────────────────

await check('THE PRODUCTION SCHEME THROWS — zk RepID cannot execute here', async () => {
  const pending = new N.PendingPoseidon2Scheme();
  eq(pending.parametersKnown, false, 'it must not claim to know its parameters');
  for (const [name, call] of [
    ['commit', () => pending.commit('s')],
    ['nullify', () => pending.nullify('s', 'd', 'sc')],
    ['hashPair', () => pending.hashPair('a', 'b')],
  ]) {
    let threw = false;
    try {
      await call();
    } catch (e) {
      threw = true;
      truthy(
        /parameters are not available/.test(e.message),
        `${name} must refuse for the stated reason, got: ${e.message}`
      );
    }
    truthy(threw, `${name} must throw rather than invent a parameter set`);
  }
});

// ── 2. the counter measures the scheme, not itself ──────────────────────────

await check('countingScheme DELEGATES — it does not compute its own digests', async () => {
  const counted = C.countingScheme(toy);
  eq(await counted.commit('x'), await toy.commit('x'), 'commit must pass through unchanged');
  eq(await counted.hashPair('a', 'b'), await toy.hashPair('a', 'b'), 'hashPair must pass through');
  eq(counted.scheme, toy.scheme, 'it must report the wrapped scheme, not a name of its own');
  // A counter that digested independently would keep reporting cheerfully after
  // the real scheme began throwing — measuring itself instead of the subject.
  const overThrowing = C.countingScheme(new N.PendingPoseidon2Scheme());
  let threw = false;
  try {
    await overThrowing.commit('x');
  } catch {
    threw = true;
  }
  truthy(threw, 'wrapping a throwing scheme must still throw');
});

// ── 3. the cost of each operation, against the BOUND ────────────────────────

await check('buildGroup costs exactly N-1 hashes — the Merkle minimum', async () => {
  for (const size of SIZES) {
    const s = C.countingScheme(toy);
    const members = [];
    for (let i = 0; i < size; i++) members.push(await toy.commit('m' + i));
    s.reset();
    await N.buildGroup(members, s);
    costEq({ ...s.cost }, C.COST_MODEL.buildGroup(size), `buildGroup(${size})`);
  }
});

await check('the membership path is exactly ceil(log2 N) steps', async () => {
  for (const size of SIZES) {
    const { path } = await group(toy, size);
    eq(path.length, C.COST_MODEL.membershipPathLength(size), `path length at N=${size}`);
  }
});

await check('buildBindingStatement is CONSTANT in group size', async () => {
  for (const size of SIZES) {
    const { g, path } = await group(toy, size);
    const s = C.countingScheme(toy);
    await N.buildBindingStatement({
      secret: 'm0', domain: 'd', scope: 'sc', groupRoot: g.root, membership: path, scheme: s,
    });
    costEq({ ...s.cost }, C.COST_MODEL.buildBindingStatement(), `buildBindingStatement(N=${size})`);
  }
});

await check('verification costs 2 + ceil(log2 N) — the floor, not a budget', async () => {
  for (const size of SIZES) {
    const { g, path } = await group(toy, size);
    const st = await N.buildBindingStatement({
      secret: 'm0', domain: 'd', scope: 'sc', groupRoot: g.root, membership: path, scheme: toy,
    });
    const s = C.countingScheme(toy);
    const v = await N.verifyBindingByRecomputation(st, s);
    eq(v.valid, true, `verification must succeed at N=${size}`);
    eq(v.provenWithoutSecret, false, 'recomputation ALWAYS required the secret');
    costEq({ ...s.cost }, C.COST_MODEL.verifyBindingByRecomputation(size), `verify(N=${size})`);
  }
});

await check('THE PROPERTY NO FUNCTIONAL SUITE SEES: verification is O(log N)', async () => {
  const measure = async (size) => {
    const { g, path } = await group(toy, size);
    const st = await N.buildBindingStatement({
      secret: 'm0', domain: 'd', scope: 'sc', groupRoot: g.root, membership: path, scheme: toy,
    });
    const s = C.countingScheme(toy);
    await N.verifyBindingByRecomputation(st, s);
    return C.totalCalls({ ...s.cost });
  };
  const small = await measure(64);
  const large = await measure(4096);          // 64 squared
  eq(small, 8, 'verify at N=64');
  eq(large, 14, 'verify at N=4096');
  // O(log N): squaring the group ADDS to the count. O(N) would MULTIPLY it.
  truthy(large < small * 2, `squaring N must not double the work: ${small} -> ${large}`);
  truthy(large < 64, `an O(N) verifier would cost ~4098 calls here, not ${large}`);
  eq(C.verifyGrowth(64, 4096), 14 / 8, 'the model agrees with the measurement');
});

await check('the transition path is constant per event', async () => {
  const s = C.countingScheme(toy);
  const c = await T.commitEvent(
    { subject: 'agent-1', signal: 'bft_vote_correct', observedAt: '2026-08-16T00:00:00Z' },
    s
  );
  costEq({ ...s.cost }, C.COST_MODEL.commitEvent(), 'commitEvent');
  s.reset();
  await T.appendEvent(T.GENESIS_ROOT, c, s);
  costEq({ ...s.cost }, C.COST_MODEL.appendEvent(), 'appendEvent');
  // So a history of E events costs exactly E commits + E hashPairs. Linear in
  // events, independent of group size — worth pinning before anyone adds a
  // "recompute the whole chain" convenience.
});

await check('the model is the BOUND, not a recording of current behaviour', async () => {
  // Stated as arithmetic a reader can check without running anything.
  eq(C.COST_MODEL.buildGroup(1).hashPair, 0, 'a single-member group needs no internal node');
  eq(C.COST_MODEL.buildGroup(1024).hashPair, 1023, 'N-1');
  eq(C.COST_MODEL.membershipPathLength(1), 0, 'a group of one has no siblings');
  eq(C.COST_MODEL.membershipPathLength(1024), 10, 'log2');
  eq(C.totalCalls(C.COST_MODEL.verifyBindingByRecomputation(1024)), 12, '1 + 1 + 10');
});

rmSync(outDir, { recursive: true, force: true });

console.log(`\nzk-cost: ${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  console.log('FAILED — zk RepID cost is not what the bound says.\n');
  process.exit(1);
}
console.log('All zk-cost checks passed.\n');
