#!/usr/bin/env node
// scripts/mcp-fleet-smoke.mjs — executable check for the fleet MCP server.
//
// Run:  node scripts/mcp-fleet-smoke.mjs
//
// WHY THIS EXISTS. The defect this repo keeps logging is a system reporting
// success it has not earned, and the prototype in lib/mcp/ is a port of code
// that has exactly that defect: kyegomez/swarms threads a `correct_answer`
// through twenty call sites, logs "Using correct answer for validation", and
// never compares it to anything. Shipping a careful-looking port with no
// executable check would reproduce the failure while claiming to fix it.
//
// So the rules that make this port worth having — liveness never asserted from
// silence, an empty registry never reported as an empty fleet, a zero-row
// UPDATE never reported as a success — are asserted here against a stub source
// with a fixed clock. Those cases are unreachable through HTTP without waiting
// ten real minutes and depopulating a production table.
//
// No network, no database, no credentials. The Supabase-backed FleetSource is
// swapped for an in-memory one; what is under test is the decision logic.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// ── build ────────────────────────────────────────────────────────────────────
// tsc resolves the `@/*` path alias for type checking but emits it verbatim,
// and node cannot resolve it at runtime. Rewriting the three intra-module
// specifiers is cheaper and clearer than adding a loader or a bundler.

const outDir = mkdtempSync(join(tmpdir(), 'mcp-fleet-'));

// Compile through a real tsconfig rather than a file list: passing files on the
// CLI makes tsc ignore tsconfig.json entirely, which drops the `@/*` path
// mapping and fails on the first intra-module import. Extending the repo config
// also means this checks the same `strict` settings the build uses.
const tsconfigPath = join(outDir, 'tsconfig.smoke.json');
writeFileSync(
  tsconfigPath,
  JSON.stringify({
    extends: join(process.cwd(), 'tsconfig.json'),
    compilerOptions: {
      outDir,
      noEmit: false,
      incremental: false,
      declaration: false,
      // rootDir keeps the emitted layout flat (jsonrpc.js next to fleet.js)
      // so the specifier rewrite below stays a one-liner.
      rootDir: join(process.cwd(), 'lib/mcp'),
      lib: ['esnext'],
      jsx: undefined,
      plugins: undefined,
    },
    include: [join(process.cwd(), 'lib/mcp/**/*.ts')],
  })
);

try {
  execFileSync('npx', ['tsc', '-p', tsconfigPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: process.cwd(),
  });
} catch (e) {
  console.error('mcp-fleet-smoke: compilation failed\n');
  console.error(e.stdout?.toString() || e.message);
  process.exit(1);
}

for (const file of readdirSync(outDir).filter((f) => f.endsWith('.js'))) {
  const path = join(outDir, file);
  writeFileSync(
    path,
    readFileSync(path, 'utf8').replace(/(['"])@\/lib\/mcp\/([a-z]+)\1/g, "'./$2.js'")
  );
  // tsc emits .js without an extension on relative imports under some configs.
  writeFileSync(
    path,
    readFileSync(path, 'utf8').replace(/from '\.\/([a-z]+)'/g, "from './$1.js'")
  );
}

const { handleRpc, negotiateProtocolVersion, PREFERRED_PROTOCOL_VERSION } = await import(
  pathToFileURL(join(outDir, 'server.js')).href
);
const { deriveNodeView, LIVE_WINDOW_MINUTES } = await import(
  pathToFileURL(join(outDir, 'fleet.js')).href
);

// ── harness ──────────────────────────────────────────────────────────────────

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failures.push(`${name}\n    ${e.message}`);
  }
}

function eq(actual, expected, what) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${what}: expected ${b}, got ${a}`);
}

function truthy(value, what) {
  if (!value) throw new Error(`${what}: expected truthy, got ${JSON.stringify(value)}`);
}

const NOW = new Date('2026-08-13T12:00:00.000Z');
const minutesAgo = (m) => new Date(NOW.getTime() - m * 60_000).toISOString();
const minutesAhead = (m) => new Date(NOW.getTime() + m * 60_000).toISOString();

function node(overrides = {}) {
  return {
    node_id: 'node-a',
    surface: 'railway',
    lane: 'hal',
    owns: ['repid-engine'],
    branch: 'main',
    purpose: 'HAL scoring',
    models: ['claude-opus-5'],
    region: 'us-east4',
    cpu_cores: 8,
    ram_mb: 16384,
    can_prove: false,
    can_hal_vote: true,
    heartbeat_at: minutesAgo(1),
    expires_at: minutesAhead(14),
    acquired_at: minutesAgo(60),
    ...overrides,
  };
}

function stubSource(rows) {
  const store = [...rows];
  return {
    listNodes: async () => store,
    upsertNode: async (r) => {
      const i = store.findIndex((n) => n.node_id === r.node_id);
      const row = node({ ...r, heartbeat_at: NOW.toISOString(), expires_at: minutesAhead(15) });
      if (i >= 0) store[i] = row;
      else store.push(row);
    },
    touchHeartbeat: async (id) => {
      const i = store.findIndex((n) => n.node_id === id);
      if (i < 0) return false;
      store[i] = { ...store[i], heartbeat_at: NOW.toISOString() };
      return true;
    },
  };
}

const ctx = (rows, principal = 'user') => ({
  source: stubSource(rows),
  principal,
  now: NOW,
});

const call = (name, args, rows, principal = 'user') =>
  handleRpc(
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
    ctx(rows, principal)
  );

const payload = (res) => res.result.structuredContent;

// ── liveness: the rules the port exists to enforce ───────────────────────────

check('fresh heartbeat + active lease -> live and dispatchable', () => {
  const v = deriveNodeView(node({ heartbeat_at: minutesAgo(2) }), NOW);
  eq(v.status, 'live', 'status');
  eq(v.is_live, true, 'is_live');
  eq(v.dispatchable, true, 'dispatchable');
  eq(v.evidence.signal, 'heartbeat', 'signal');
});

check('stale heartbeat + active lease -> is_live is NULL, never false', () => {
  const v = deriveNodeView(node({ heartbeat_at: minutesAgo(45), expires_at: minutesAhead(30) }), NOW);
  eq(v.status, 'lease_active_no_recent_heartbeat', 'status');
  eq(v.is_live, null, 'is_live must be null, not false — silence is not death');
  eq(v.dispatchable, false, 'dispatchable');
  eq(v.evidence.signal, 'none', 'signal');
});

check('expired lease -> not dispatchable, still not asserted dead', () => {
  const v = deriveNodeView(node({ heartbeat_at: minutesAgo(90), expires_at: minutesAgo(30) }), NOW);
  eq(v.status, 'lease_expired', 'status');
  eq(v.is_live, null, 'is_live');
  eq(v.dispatchable, false, 'dispatchable');
});

check('is_live is NEVER false, across every reachable status', () => {
  const rows = [
    node({ heartbeat_at: minutesAgo(0) }),
    node({ heartbeat_at: minutesAgo(LIVE_WINDOW_MINUTES) }),
    node({ heartbeat_at: minutesAgo(LIVE_WINDOW_MINUTES + 0.1) }),
    node({ heartbeat_at: minutesAgo(600), expires_at: minutesAgo(1) }),
    node({ heartbeat_at: minutesAhead(5) }), // clock skew: heartbeat in the future
  ];
  for (const r of rows) {
    const v = deriveNodeView(r, NOW);
    if (v.is_live === false) throw new Error(`is_live === false for status '${v.status}'`);
    if (v.is_live !== true && v.is_live !== null) {
      throw new Error(`is_live must be true|null, got ${JSON.stringify(v.is_live)}`);
    }
  }
});

check(`boundary: heartbeat exactly ${LIVE_WINDOW_MINUTES} min old is still live`, () => {
  const v = deriveNodeView(node({ heartbeat_at: minutesAgo(LIVE_WINDOW_MINUTES) }), NOW);
  eq(v.status, 'live', 'status at exact window edge');
});

check(`boundary: heartbeat just past ${LIVE_WINDOW_MINUTES} min is unknown`, () => {
  const v = deriveNodeView(node({ heartbeat_at: minutesAgo(LIVE_WINDOW_MINUTES + 0.5) }), NOW);
  eq(v.status, 'lease_active_no_recent_heartbeat', 'status just past window');
});

check('expired lease wins over a fresh heartbeat', () => {
  // A node heartbeating into an expired lease is misconfigured, not available.
  const v = deriveNodeView(node({ heartbeat_at: minutesAgo(0), expires_at: minutesAgo(1) }), NOW);
  eq(v.status, 'lease_expired', 'status');
  eq(v.dispatchable, false, 'dispatchable');
});

// ── empty registry is not an empty fleet ─────────────────────────────────────

{
  const res = await call('discover_agents', {}, []);
  check('empty registry -> registry_populated false', () => {
    eq(payload(res).registry_populated, false, 'registry_populated');
    eq(payload(res).count, 0, 'count');
  });
  check('empty registry -> verification NOT_CHECKED', () => {
    eq(payload(res).verification.status, 'NOT_CHECKED', 'verification.status');
    truthy(
      payload(res).verification.note.includes('UNPOPULATED'),
      'note must say the registry is unpopulated'
    );
  });
  check('empty registry -> tool did not report an error', () => {
    eq(res.result.isError, false, 'isError');
  });
}

{
  const res = await call('fleet_health', {}, []);
  check('fleet_health on empty registry is NOT_CHECKED', () => {
    eq(payload(res).verification.status, 'NOT_CHECKED', 'verification.status');
    eq(payload(res).total_registered, 0, 'total_registered');
  });
}

{
  const rows = [node({ node_id: 'live-1' })];
  const res = await call('discover_agents', {}, rows);
  check('populated registry -> VERIFIED', () => {
    eq(payload(res).verification.status, 'VERIFIED', 'verification.status');
    eq(payload(res).registry_populated, true, 'registry_populated');
  });
}

// ── filtering and withholding ────────────────────────────────────────────────

{
  const rows = [
    node({ node_id: 'live-1', lane: 'hal' }),
    node({ node_id: 'stale-1', lane: 'hal', heartbeat_at: minutesAgo(60) }),
    node({ node_id: 'live-2', lane: 'trade' }),
  ];

  const res = await call('discover_agents', {}, rows);
  check('undispatchable nodes are withheld by default and the count is reported', async () => {
    eq(payload(res).count, 2, 'dispatchable count');
    eq(payload(res).withheld_as_undispatchable, 1, 'withheld count must be visible, not silent');
  });

  const all = await call('discover_agents', { include_undispatchable: true }, rows);
  check('include_undispatchable returns the full set', () => {
    eq(payload(all).count, 3, 'count with undispatchable included');
    eq(payload(all).withheld_as_undispatchable, 0, 'nothing withheld');
  });

  const lane = await call('discover_agents', { lane: 'trade' }, rows);
  check('lane filter applies', () => eq(payload(lane).count, 1, 'lane-filtered count'));

  const cap = await call('discover_agents', { capability: 'can_prove' }, rows);
  check('capability filter applies', () => eq(payload(cap).count, 0, 'can_prove count'));

  const health = await call('fleet_health', {}, rows);
  check('fleet_health separates known-live from unknown', () => {
    eq(payload(health).total_registered, 3, 'total');
    eq(payload(health).dispatchable_count, 2, 'dispatchable');
    eq(payload(health).liveness_unknown_count, 1, 'unknown');
    eq(payload(health).by_status.live, 2, 'by_status.live');
  });

  check('fleet_health counts capabilities only on dispatchable nodes', () => {
    // stale-1 has can_hal_vote true but is not reachable; counting it would
    // overstate what the fleet can actually do right now.
    eq(payload(health).dispatchable_capabilities.can_hal_vote, 2, 'can_hal_vote among dispatchable');
  });
}

// ── errors that must not read as success ─────────────────────────────────────

{
  const res = await call('get_agent_details', { node_id: 'nope' }, [node({ node_id: 'real' })]);
  check('get_agent_details on a miss is isError', () => {
    eq(res.result.isError, true, 'isError');
    truthy(payload(res).error.includes('nope'), 'error names the id');
  });
}

{
  const res = await call('heartbeat_node', { node_id: 'ghost' }, [], 'service');
  check('heartbeat on an unregistered node is an error, not a silent success', () => {
    eq(res.result.isError, true, 'isError');
    truthy(payload(res).note.includes('zero rows'), 'note explains the zero-row update');
  });
}

{
  const res = await call('register_node', { node_id: 'x', surface: 'railway', lane: 'hal' }, [], 'user');
  check('write tools reject the user principal', () => {
    eq(res.result.isError, true, 'isError');
    truthy(payload(res).error.includes('service principal'), 'error explains the requirement');
  });
}

{
  const res = await call('discover_agents', { capability: 'can_fly' }, []);
  check('bad enum arg returns isError, not a protocol error', () => {
    truthy(res.result !== undefined, 'must be a result, not an error envelope');
    eq(res.result.isError, true, 'isError');
    truthy(payload(res).error.includes('can_prove'), 'message lists valid values for self-correction');
  });
}

{
  const res = await call('get_agent_details', {}, []);
  check('missing required arg returns isError with a usable message', () => {
    eq(res.result.isError, true, 'isError');
    truthy(payload(res).error.includes('node_id'), 'message names the missing argument');
  });
}

{
  const res = await call('nonexistent_tool', {}, []);
  check('unknown tool is a tool error, not a protocol error', () => {
    eq(res.result.isError, true, 'isError');
  });
}

// ── protocol ─────────────────────────────────────────────────────────────────

{
  const res = await handleRpc(
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
    ctx([])
  );
  check('initialize echoes a supported protocol version', () => {
    eq(res.result.protocolVersion, '2025-06-18', 'protocolVersion');
    eq(res.result.serverInfo.name, 'trinity-fleet', 'serverInfo.name');
  });
  check('initialize advertises only tools capability', () => {
    eq(Object.keys(res.result.capabilities), ['tools'], 'capabilities keys');
  });
}

check('unknown protocol version falls back to preferred', () => {
  eq(negotiateProtocolVersion('1999-01-01'), PREFERRED_PROTOCOL_VERSION, 'fallback');
  eq(negotiateProtocolVersion(undefined), PREFERRED_PROTOCOL_VERSION, 'absent');
});

{
  const res = await handleRpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, ctx([]));
  check('notifications get no response', () => eq(res, null, 'response to notification'));
}

{
  const res = await handleRpc({ jsonrpc: '2.0', id: 7, method: 'ping' }, ctx([]));
  check('ping returns an empty result', () => eq(res.result, {}, 'ping result'));
}

{
  const asUser = await handleRpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, ctx([], 'user'));
  const asService = await handleRpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, ctx([], 'service'));
  check('tools/list is scoped by principal', () => {
    eq(asUser.result.tools.length, 3, 'user tool count');
    eq(asService.result.tools.length, 5, 'service tool count');
  });
  check('write tools are invisible to the user principal', () => {
    const names = asUser.result.tools.map((t) => t.name);
    if (names.includes('register_node')) throw new Error('register_node leaked into user tool list');
  });
  check('every tool declares an object inputSchema', () => {
    for (const t of asService.result.tools) {
      if (t.inputSchema?.type !== 'object') throw new Error(`${t.name} has no object inputSchema`);
    }
  });
}

{
  const res = await handleRpc({ jsonrpc: '2.0', id: 3, method: 'resources/list' }, ctx([]));
  check('unsupported method returns -32601', () => eq(res.error.code, -32601, 'error code'));
}

{
  const res = await handleRpc(
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 123 } },
    ctx([])
  );
  check('malformed tools/call params returns -32602', () => eq(res.error.code, -32602, 'error code'));
}

{
  const broken = {
    listNodes: async () => {
      throw new Error('agent_node_registry read failed: connection refused');
    },
  };
  const res = await handleRpc(
    { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'fleet_health', arguments: {} } },
    { source: broken, principal: 'user', now: NOW }
  );
  check('a database failure is a protocol error, not an empty fleet', () => {
    truthy(res.error, 'must be an error envelope');
    eq(res.error.code, -32603, 'error code');
    truthy(res.error.message.includes('connection refused'), 'underlying cause is preserved');
  });
}

// ── report ───────────────────────────────────────────────────────────────────

console.log(`\nmcp-fleet-smoke: ${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}
console.log('All fleet MCP checks passed.');
