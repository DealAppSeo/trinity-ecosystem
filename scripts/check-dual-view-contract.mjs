#!/usr/bin/env node
// scripts/check-dual-view-contract.mjs — make the dual-view contract enforceable.
//
// Run: npm run check:dual-view
//
// WHY THIS EXISTS. Four lanes are building against `lib/dual-view/contract.ts` in
// parallel (docs/DUAL-VIEW-LAUNCH-PLAN.md §6). The contract is the only shared
// surface between them, so a fixture that drifts out of spec, or a validator that
// stops rejecting a bad shape, breaks a lane that cannot see the change. This
// runs in `npm run check` so drift fails the same gate everything else does.
//
// WHAT IT ASSERTS, IN THREE GROUPS:
//   1. Every fixture is a valid, integral snapshot.
//   2. The validator actually REJECTS each malformed shape it claims to catch.
//      A validator that has never been shown to fail is an untested assertion —
//      the same discipline `scripts/check-e2e-harness.mjs` applies to the E2E
//      suite. Group 2 is the load-bearing half of this file.
//   3. `applyEvent` is pure and round-trips a stream back to its snapshot.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

let pass = 0;
const failures = [];

function ok(name, cond, detail = '') {
  if (cond) {
    pass += 1;
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function eq(name, actual, expected) {
  ok(name, Object.is(actual, expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ---------------------------------------------------------------------------
// Load the TS modules. No ts-node in this repo, so transpile to a temp dir with
// the pinned local compiler — the same resolution the other check scripts use.
// Reading the source and regex-ing it would test my model of the file rather
// than the file.
// ---------------------------------------------------------------------------

const OUT = join(ROOT, '.dual-view-check');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const tsc = join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
try {
  execFileSync(
    process.execPath,
    [
      tsc,
      join(ROOT, 'lib/dual-view/contract.ts'),
      join(ROOT, 'lib/dual-view/fixtures.ts'),
      '--outDir',
      OUT,
      '--module',
      'es2022',
      '--target',
      'es2022',
      '--moduleResolution',
      'bundler',
      '--strict',
      '--skipLibCheck',
    ],
    { stdio: 'pipe' },
  );
} catch (err) {
  const out = `${err.stdout ?? ''}${err.stderr ?? ''}`;
  console.error('FAILED — dual-view contract does not compile:\n' + out);
  process.exit(1);
}

// Emitted as ESM but with .js extensions missing from relative imports; patch
// the one import so node can load it.
const fixturesPath = join(OUT, 'fixtures.js');
writeFileSync(
  fixturesPath,
  readFileSync(fixturesPath, 'utf8').replace(/from ['"]\.\/contract['"]/g, "from './contract.js'"),
);
writeFileSync(join(OUT, 'package.json'), JSON.stringify({ type: 'module' }));

const contract = await import(join(OUT, 'contract.js'));
const fixtures = await import(fixturesPath);

const {
  CONTRACT_VERSION,
  NODE_STATUSES,
  EVENT_KINDS,
  validateNode,
  validateEdge,
  validateAttentionItem,
  validateEvent,
  validateSnapshotIntegrity,
  applyEvent,
} = contract;
const { FIXTURES, FIXTURE_NAMES, snapshotEvent } = fixtures;

// ---------------------------------------------------------------------------
// Group 0 — the contract's own shape
// ---------------------------------------------------------------------------

ok('CONTRACT_VERSION is semver', /^\d+\.\d+\.\d+$/.test(CONTRACT_VERSION), CONTRACT_VERSION);
eq('six node statuses', NODE_STATUSES.length, 6);
ok('`stale` is a status', NODE_STATUSES.includes('stale'));
eq('seven event kinds', EVENT_KINDS.length, 7);

// ---------------------------------------------------------------------------
// Group 1 — every fixture is valid and integral
// ---------------------------------------------------------------------------

eq('six fixtures', FIXTURE_NAMES.length, 6);

for (const name of FIXTURE_NAMES) {
  const snap = FIXTURES[name];
  const ev = snapshotEvent(name);

  const evViolations = validateEvent(ev);
  ok(`fixture ${name}: valid snapshot event`, evViolations.length === 0, JSON.stringify(evViolations));

  const intViolations = validateSnapshotIntegrity(snap);
  ok(`fixture ${name}: referentially integral`, intViolations.length === 0, JSON.stringify(intViolations));

  eq(`fixture ${name}: carries CONTRACT_VERSION`, ev.v, CONTRACT_VERSION);

  // Deterministic: two reads give byte-identical JSON. A fixture that moves
  // cannot be snapshot-tested or used to reproduce a rendering bug.
  ok(
    `fixture ${name}: deterministic`,
    JSON.stringify(snapshotEvent(name)) === JSON.stringify(snapshotEvent(name)),
  );

  // Every node carries a non-empty reason. This is the anti-"unearned green"
  // invariant; it is cheap and it is the whole point of the field.
  ok(
    `fixture ${name}: every node has a reason`,
    snap.nodes.every((n) => typeof n.reason === 'string' && n.reason.trim() !== ''),
  );
}

// The fleet fixture must keep the measured distribution, not drift to all-green.
{
  const agents = FIXTURES.swarm_12.nodes.filter((n) => n.kind === 'agent');
  eq('swarm_12: 12 agents', agents.length, 12);
  eq('swarm_12: 3 running', agents.filter((n) => n.status === 'running').length, 3);
  eq('swarm_12: 9 stale', agents.filter((n) => n.status === 'stale').length, 9);
  ok(
    'swarm_12: no stale agent claims VERIFIED',
    agents.filter((n) => n.status === 'stale').every((n) => n.evidence === 'NOT_CHECKED'),
  );
}

// The empty fixture must still render something.
eq('empty: one node, the core', FIXTURES.empty.nodes.length, 1);
eq('empty: no attention items', FIXTURES.empty.attention.length, 0);

// The MVP gate fixture must be unresolved — a pending gate has no proof yet.
{
  const gate = FIXTURES.one_gate.attention.find((a) => a.kind === 'gated');
  ok('one_gate: has a gated item', Boolean(gate));
  eq('one_gate: gate is unresolved', gate?.gate?.proof, undefined);
}

// ---------------------------------------------------------------------------
// Group 2 — the validator REJECTS. This is the half that can rot silently.
// ---------------------------------------------------------------------------

const rejects = (name, fn, input) =>
  ok(`rejects: ${name}`, fn(input).length > 0, 'validator accepted a malformed value');

const goodNode = {
  id: 'n1',
  kind: 'agent',
  label: 'A',
  status: 'running',
  reason: 'working',
  evidence: 'VERIFIED',
};

ok('accepts: a well-formed node', validateNode(goodNode).length === 0);
rejects('node with empty reason', validateNode, { ...goodNode, reason: '   ' });
rejects('node with missing reason', validateNode, { ...goodNode, reason: undefined });
rejects('node with unknown status', validateNode, { ...goodNode, status: 'idle' });
rejects('node with unknown evidence', validateNode, { ...goodNode, evidence: 'PASSED' });
rejects('node with unknown kind', validateNode, { ...goodNode, kind: 'swarm' });
rejects('node with empty id', validateNode, { ...goodNode, id: '' });
rejects('node parented to itself', validateNode, { ...goodNode, parentId: 'n1' });
rejects('pai_core with a parent', validateNode, {
  ...goodNode,
  kind: 'pai_core',
  parentId: 'x',
});
// The "success it has not earned" shape, in one assertion.
rejects('blocked node claiming VERIFIED', validateNode, {
  ...goodNode,
  status: 'blocked',
  evidence: 'VERIFIED',
});
rejects('node that is not an object', validateNode, 'nope');

const goodEdge = { id: 'e1', from: 'a', to: 'b', kind: 'depends' };
ok('accepts: a well-formed edge', validateEdge(goodEdge).length === 0);
rejects('edge with unknown kind', validateEdge, { ...goodEdge, kind: 'points-at' });
rejects('self-loop edge', validateEdge, { ...goodEdge, to: 'a' });

const goodItem = {
  id: 'i1',
  kind: 'receipt',
  title: 'T',
  body: 'B',
  at: '2026-08-15T12:00:00.000Z',
};
ok('accepts: a well-formed item', validateAttentionItem(goodItem).length === 0);
rejects('item with a non-ISO timestamp', validateAttentionItem, { ...goodItem, at: 'yesterday' });
rejects('item with unknown kind', validateAttentionItem, { ...goodItem, kind: 'post' });
// Both directions of the gate iff-rule.
rejects('gated item with no gate', validateAttentionItem, { ...goodItem, kind: 'gated' });
rejects('non-gated item carrying a gate', validateAttentionItem, {
  ...goodItem,
  gate: { gateId: 'g', action: 'a', risk: 'low' },
});
rejects('gate with unknown risk', validateAttentionItem, {
  ...goodItem,
  kind: 'gated',
  gate: { gateId: 'g', action: 'a', risk: 'catastrophic' },
});
rejects('gate proof with non-boolean verified', validateAttentionItem, {
  ...goodItem,
  kind: 'gated',
  gate: { gateId: 'g', action: 'a', risk: 'low', proof: { controlProofId: 'c', verified: 'yes' } },
});

rejects('event with unknown t', validateEvent, { t: 'node.explode', v: '1.0.0' });
rejects('event with no version', validateEvent, { t: 'node.remove', v: '', id: 'x' });
rejects('gate.resolved with non-boolean approved', validateEvent, {
  t: 'gate.resolved',
  v: CONTRACT_VERSION,
  gateId: 'g',
  approved: 'yes',
  controlProofId: 'c',
});

// Integrity-level rejections: these are the faults that make a graph library
// throw or silently drop a node at render time.
{
  const base = FIXTURES.calm;
  const dangling = { ...base, edges: [...base.edges, { id: 'e-x', from: 'pai', to: 'ghost', kind: 'depends' }] };
  ok('rejects: edge pointing at a missing node', validateSnapshotIntegrity(dangling).length > 0);

  const twoCores = { ...base, nodes: [...base.nodes, { ...base.nodes[0], id: 'pai2' }] };
  ok('rejects: two pai_core nodes', validateSnapshotIntegrity(twoCores).length > 0);

  const dupe = { ...base, nodes: [...base.nodes, base.nodes[1]] };
  ok('rejects: duplicate node id', validateSnapshotIntegrity(dupe).length > 0);

  const orphanParent = {
    ...base,
    nodes: base.nodes.map((n) => (n.id === 'a-draft' ? { ...n, parentId: 'nobody' } : n)),
  };
  ok('rejects: parent that does not exist', validateSnapshotIntegrity(orphanParent).length > 0);

  // A node that says "needs you" with nothing in the feed to clear it is a dead
  // end: the graph demands attention and offers no way to give it.
  const unclearable = {
    ...base,
    nodes: base.nodes.map((n) =>
      n.id === 'a-draft' ? { ...n, status: 'waiting_human', reason: 'needs you' } : n,
    ),
  };
  ok('rejects: waiting_human with no gate card', validateSnapshotIntegrity(unclearable).length > 0);

  // The gated/historical asymmetry, asserted in both directions. This rule was
  // found by the round-trip test below, not by review: removing a finished node
  // orphaned a receipt card, and the first draft called that a violation — which
  // would have made a feed delete its own history.
  const orphanHistory = {
    ...base,
    attention: [...base.attention, { ...base.attention[0], id: 'i-orphan', nodeId: 'ghost' }],
  };
  ok(
    'accepts: historical item pointing at a departed node',
    validateSnapshotIntegrity(orphanHistory).length === 0,
  );
  const orphanGate = {
    ...base,
    attention: [
      ...base.attention,
      {
        id: 'i-orphan-gate',
        kind: 'gated',
        title: 'T',
        body: 'B',
        at: '2026-08-15T12:00:00.000Z',
        nodeId: 'ghost',
        gate: { gateId: 'g', action: 'a', risk: 'low' },
      },
    ],
  };
  ok('rejects: gated item pointing at a departed node', validateSnapshotIntegrity(orphanGate).length > 0);
}

// ---------------------------------------------------------------------------
// Group 3 — applyEvent is pure and round-trips
// ---------------------------------------------------------------------------

{
  const start = FIXTURES.calm;
  const before = JSON.stringify(start);

  const added = applyEvent(start, {
    t: 'node.upsert',
    v: CONTRACT_VERSION,
    node: { ...goodNode, id: 'a-new', parentId: 'pai' },
  });
  eq('applyEvent: upsert adds', added.nodes.length, start.nodes.length + 1);
  eq('applyEvent: input not mutated', JSON.stringify(start), before);

  const replaced = applyEvent(added, {
    t: 'node.upsert',
    v: CONTRACT_VERSION,
    node: { ...goodNode, id: 'a-new', parentId: 'pai', label: 'Renamed' },
  });
  eq('applyEvent: upsert replaces, not duplicates', replaced.nodes.length, added.nodes.length);
  eq(
    'applyEvent: upsert applied the new value',
    replaced.nodes.find((n) => n.id === 'a-new')?.label,
    'Renamed',
  );

  // Removing a node must take its edges with it, or the next integrity check
  // fails on a dangling reference the caller never created.
  const removed = applyEvent(start, { t: 'node.remove', v: CONTRACT_VERSION, id: 'a-research' });
  ok('applyEvent: remove takes its edges', validateSnapshotIntegrity(removed).length === 0);
  ok(
    'applyEvent: remove left no edge referencing it',
    removed.edges.every((e) => e.from !== 'a-research' && e.to !== 'a-research'),
  );

  // Approval is not verification. `gate.resolved` must leave `verified: false`
  // until the verify route has actually answered.
  const resolved = applyEvent(FIXTURES.one_gate, {
    t: 'gate.resolved',
    v: CONTRACT_VERSION,
    gateId: 'gate-remember-tone',
    approved: true,
    controlProofId: 'cp-abc',
  });
  const g = resolved.attention.find((a) => a.gate?.gateId === 'gate-remember-tone');
  eq('applyEvent: gate.resolved records the proof id', g?.gate?.proof?.controlProofId, 'cp-abc');
  eq('applyEvent: approval alone does not set verified', g?.gate?.proof?.verified, false);

  // Unknown events must not blank the screen.
  const unknown = applyEvent(start, { t: 'nonsense', v: CONTRACT_VERSION });
  eq('applyEvent: unknown event is a no-op', JSON.stringify(unknown), before);

  // Round trip: snapshot → deltas → same snapshot.
  const rebuilt = start.nodes.reduce(
    (acc, node) => applyEvent(acc, { t: 'node.upsert', v: CONTRACT_VERSION, node }),
    applyEvent({ nodes: [], edges: [], attention: [] }, {
      t: 'snapshot',
      v: CONTRACT_VERSION,
      nodes: [],
      edges: start.edges,
      attention: start.attention,
    }),
  );
  eq('applyEvent: replay reconstructs the node set', rebuilt.nodes.length, start.nodes.length);
  ok('applyEvent: replayed snapshot is integral', validateSnapshotIntegrity(rebuilt).length === 0);
}

// ---------------------------------------------------------------------------

rmSync(OUT, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(`FAILED — ${failures.length} of ${pass + failures.length} assertions:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

console.log(`VERIFIED — dual-view contract: ${pass} assertions, 0 failed.`);
