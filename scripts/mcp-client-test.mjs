#!/usr/bin/env node
// scripts/mcp-client-test.mjs — the MCP client, and the loop's tool surface.
//
// Run: node scripts/mcp-client-test.mjs
//
// HALF OF THIS IS INTEROP, NOT MOCKING. The client is driven against the REAL
// `handleRpc` from lib/mcp/server.ts over an in-process transport, so what is
// asserted is that the two halves of this repo agree on the wire — not that the
// client agrees with a fixture I wrote to match it. A mock transport can only
// ever confirm my own reading of the protocol.
//
// The other half is adversarial, and covers what a cooperating server cannot
// produce: transport failures, id mismatches, malformed envelopes.
//
// The assertions that carry the file:
//
//   * 'a transport failure is UNAVAILABLE, never an error' — `tools.
//     unavailable_is_not_checked` is constitutional. Reading a blocked host as
//     failure is how a proxy 403 became a credential rotation here.
//   * 'a JSON-RPC error is an ERROR, not unavailable' — the server answered.
//     The two failure kinds must not collapse in either direction.
//   * 'a mismatched response id is REFUSED' — accepting it attributes one
//     tool's result to another tool's call, invisibly.
//   * 'the server does not get to classify its own blast radius' — a remote
//     server annotating its own tool read-only is self-report, and an attacker
//     who controls the server controls the annotation.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const outDir = mkdtempSync(join(tmpdir(), 'mcp-client-'));
const tsconfigPath = join(outDir, 'tsconfig.client.json');
writeFileSync(
  tsconfigPath,
  JSON.stringify({
    extends: join(process.cwd(), 'tsconfig.json'),
    compilerOptions: {
      outDir,
      noEmit: false,
      incremental: false,
      declaration: false,
      // Same pin, same reason as mcp-fleet-smoke.mjs: client.ts reaches into
      // lib/trustshell/harness/ for the ToolDispatcher types, and an inferred
      // root relocates every emitted file without an error.
      rootDir: join(process.cwd(), 'lib'),
      lib: ['esnext'],
      jsx: undefined,
      plugins: undefined,
    },
    include: [
      join(process.cwd(), 'lib/mcp/**/*.ts'),
      join(process.cwd(), 'lib/trustshell/harness/loop.ts'),
      join(process.cwd(), 'lib/trustshell/harness/types.ts'),
    ],
  })
);

try {
  execFileSync('npx', ['tsc', '-p', tsconfigPath], { stdio: ['ignore', 'pipe', 'pipe'], cwd: process.cwd() });
} catch (e) {
  console.error('mcp-client-test: compilation failed\n');
  console.error(e.stdout?.toString() || e.message);
  rmSync(outDir, { recursive: true, force: true });
  process.exit(1);
}

const mcpOut = join(outDir, 'mcp');
for (const file of readdirSync(mcpOut).filter((f) => f.endsWith('.js'))) {
  const path = join(mcpOut, file);
  let src = readFileSync(path, 'utf8');
  src = src.replace(/(['"])@\/lib\/mcp\/([a-z]+)\1/g, "'./$2.js'");
  src = src.replace(/from '\.\/([a-z-]+)'/g, "from './$1.js'");
  src = src.replace(/from '\.\.\/trustshell\/harness\/([a-z-]+)'/g, "from '../trustshell/harness/$1.js'");
  writeFileSync(path, src);
}
for (const file of readdirSync(join(outDir, 'trustshell', 'harness')).filter((f) => f.endsWith('.js'))) {
  const path = join(outDir, 'trustshell', 'harness', file);
  writeFileSync(path, readFileSync(path, 'utf8').replace(/from '\.\/([a-z-]+)'/g, "from './$1.js'"));
}

const client = await import(pathToFileURL(join(mcpOut, 'client.js')).href);
const server = await import(pathToFileURL(join(mcpOut, 'server.js')).href);
const loop = await import(pathToFileURL(join(outDir, 'trustshell', 'harness', 'loop.js')).href);

// ── harness ─────────────────────────────────────────────────────────────────

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
const eq = (actual, expected, what) => {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${what}: expected ${b}, got ${a}`);
};
const truthy = (v, what) => {
  if (!v) throw new Error(`${what}: expected truthy, got ${JSON.stringify(v)}`);
};
const match = (s, re, what) => {
  if (!re.test(String(s))) throw new Error(`${what}: ${JSON.stringify(s)} !~ ${re}`);
};

// ── fixtures ────────────────────────────────────────────────────────────────

/**
 * In-process transport onto the REAL server dispatch. No network, no database:
 * the fleet source is a stub, so what is exercised is the protocol, which is
 * the part the client and server have to agree about.
 */
const loopbackTransport = (ctx) => ({
  async send(request) {
    return server.handleRpc(request, ctx);
  },
});

const stubCtx = {
  principal: 'user',
  source: {
    async listNodes() { return []; },
    async getNode() { return null; },
    async register() { return { ok: true }; },
    async heartbeat() { return { ok: true }; },
  },
  now: new Date('2026-08-14T12:00:00Z'),
};

/** A transport that fabricates replies, for cases a conforming server cannot produce. */
const scriptedTransport = (fn) => ({ send: async (req) => fn(req) });

const connected = async () => {
  const c = new client.McpClient(loopbackTransport(stubCtx));
  await c.initialize();
  return c;
};

// ── interop against the real server ─────────────────────────────────────────

await check('INTEROP: the handshake completes against the real server', async () => {
  const c = new client.McpClient(loopbackTransport(stubCtx));
  const res = await c.initialize();
  truthy(res.protocolVersion, 'a protocolVersion must come back');
  eq(res.serverInfo?.name !== undefined, true, 'serverInfo should be reported');
});

await check('INTEROP: tools/list returns the real tool descriptors', async () => {
  const c = await connected();
  const tools = await c.listTools();
  truthy(tools.length > 0, 'the real server should advertise tools');
  for (const t of tools) truthy(typeof t.name === 'string' && t.name.length > 0, 'each tool needs a name');
});

await check('INTEROP: a real tool call round-trips into a DispatchResult', async () => {
  const c = await connected();
  const tools = await c.listTools();
  const res = await c.callTool(tools[0].name, {});
  eq(typeof res.content, 'string', 'content must be a string for the loop');
  eq(res.unavailable, undefined, 'a reachable server is not unavailable');
});

await check('INTEROP: an unknown tool is an ERROR, not a protocol failure', async () => {
  // server.ts answers unknown names with isError rather than a JSON-RPC error,
  // deliberately, so the model sees the message and can correct itself. The
  // client must preserve that distinction rather than flattening it.
  const c = await connected();
  const res = await c.callTool('no_such_tool_at_all', {});
  eq(res.error, true, 'an unknown tool should surface as a tool error');
  eq(res.unavailable, undefined, 'the server answered, so nothing was unavailable');
  match(res.content, /no_such_tool_at_all/i, 'the message should name the tool');
});

// ── the distinction the file exists for ─────────────────────────────────────

await check('A TRANSPORT FAILURE IS UNAVAILABLE, NEVER AN ERROR', async () => {
  // tools.unavailable_is_not_checked is constitutional. A refused connection
  // means the agent learned nothing — reporting it as a failed tool call tells
  // the agent its call was answered.
  const c = new client.McpClient(scriptedTransport(async (req) => {
    if (req.method === 'initialize') {
      return { jsonrpc: '2.0', id: req.id, result: { protocolVersion: '2025-06-18' } };
    }
    if (req.id === undefined) return null;
    throw new Error('CONNECT tunnel failed, response 403');
  }));
  await c.initialize();
  const res = await c.callTool('anything', {});
  eq(res.unavailable, true, 'a proxy 403 was not reported as unavailable');
  eq(res.error, undefined, 'and it must NOT also read as a tool failure');
  match(res.content, /NOT a tool failure/, 'the content should say so in words');
});

await check('A JSON-RPC ERROR IS AN ERROR, not unavailable', async () => {
  // The server answered and refused. That is a real answer about this call, so
  // the agent should see it and may adapt — the opposite direction of the
  // collapse above, and just as wrong.
  const c = new client.McpClient(scriptedTransport(async (req) => {
    if (req.method === 'initialize') {
      return { jsonrpc: '2.0', id: req.id, result: { protocolVersion: '2025-06-18' } };
    }
    if (req.id === undefined) return null;
    return { jsonrpc: '2.0', id: req.id, error: { code: -32601, message: 'Method not supported.' } };
  }));
  await c.initialize();
  const res = await c.callTool('anything', {});
  eq(res.error, true, 'a JSON-RPC error should read as a tool error');
  eq(res.unavailable, undefined, 'the server answered — nothing was unreachable');
  match(res.content, /-32601/, 'the code should survive into the content');
});

await check('the two failure kinds drive DIFFERENT loop outcomes', async () => {
  // The end-to-end consequence, which is the only reason the distinction is
  // worth anything: unavailable lowers the ceiling to NOT_CHECKED; a tool error
  // does not, because the agent was told what happened and can respond.
  const run = (dispatch) =>
    loop.runAgentLoop({
      taskId: 't',
      policy: {
        maxIterations: 3, noProgressAbortAfter: 3, toolsAllowed: ['t1'],
        irreversibleRequiresHuman: [], untrustedOutputSources: [],
        maxWritesPerSession: 5, toolEffects: { t1: 'read' },
        // Explicit, because the kernel's default is ON: an unevaluated run is
        // capped at NOT_CHECKED. Correct in production and wrong here — this
        // assertion is about whether a TOOL ERROR caps the claim, and leaving
        // the evaluator requirement on would cap it for an unrelated reason and
        // the test would pass while measuring nothing.
        requireIndependentEvaluation: false,
      },
      model: {
        calls: 0,
        async turn() {
          this.calls += 1;
          if (this.calls === 1) return { calls: [{ id: 'a', name: 't1', args: {} }] };
          return { calls: [], handoff: { outcome: 'VERIFIED', summary: 'done', evidence: [] } };
        },
      },
      tools: { async call() { return dispatch; } },
      authorizer: { async authorize() { return { allowed: true, reason: 'test' }; } },
      clock: { now: () => 0 },
    });

  const unreachable = await run({ content: 'blocked', unavailable: true });
  eq(unreachable.outcome, 'NOT_CHECKED', 'an unreachable tool must cap the claim');

  const failed = await run({ content: 'the tool ran and returned an error', error: true });
  eq(failed.outcome, 'VERIFIED', 'a tool error the agent saw and handled must not cap the claim');
});

// ── envelope discipline ─────────────────────────────────────────────────────

await check('A MISMATCHED RESPONSE ID IS REFUSED', async () => {
  // A corrupt or interleaved stream. Accepting it attributes one tool's result
  // to another tool's call — wrong in a way the agent would act on, and
  // invisible in every log.
  const c = new client.McpClient(scriptedTransport(async (req) => {
    if (req.method === 'initialize') {
      return { jsonrpc: '2.0', id: req.id, result: { protocolVersion: '2025-06-18' } };
    }
    if (req.id === undefined) return null;
    return { jsonrpc: '2.0', id: 9999, result: { content: [] } };
  }));
  await c.initialize();
  const res = await c.callTool('t', {});
  // The refusal surfaces as unavailable: nothing trustworthy came back, so the
  // agent learned nothing about the call.
  eq(res.unavailable, true, 'a mismatched id was accepted');
  match(res.content, /does not match request id/, 'the reason should name the mismatch');
});

await check('a response carrying BOTH result and error is refused', async () => {
  // Ambiguous in the worst way: a reader checking `error` first sees failure,
  // one checking `result` first sees success.
  const c = new client.McpClient(scriptedTransport(async (req) => {
    if (req.method === 'initialize') {
      return { jsonrpc: '2.0', id: req.id, result: { protocolVersion: '2025-06-18' } };
    }
    if (req.id === undefined) return null;
    return { jsonrpc: '2.0', id: req.id, result: {}, error: { code: -1, message: 'x' } };
  }));
  await c.initialize();
  const res = await c.callTool('t', {});
  eq(res.unavailable, true, 'an ambiguous envelope was accepted');
  match(res.content, /exactly one of/, 'the reason should name the ambiguity');
});

await check('initialize REFUSES a server that returns no protocolVersion', async () => {
  const c = new client.McpClient(scriptedTransport(async (req) => ({
    jsonrpc: '2.0', id: req.id, result: { serverInfo: { name: 'x' } },
  })));
  let threw = false;
  try { await c.initialize(); } catch { threw = true; }
  eq(threw, true, 'a version-less handshake was accepted');
});

await check('calling before initialize is refused', async () => {
  // The handshake is where the version is agreed. A call made before it may be
  // interpreted under a version neither side chose.
  const c = new client.McpClient(loopbackTransport(stubCtx));
  let threw = false;
  try { await c.listTools(); } catch { threw = true; }
  eq(threw, true, 'tools/list ran before the handshake');
});

await check('the initialized NOTIFICATION carries no id', async () => {
  // The spec forbids a reply to a notification, and server.ts returns null for
  // exactly that reason. Sending an id would make a conforming server either
  // violate the spec or drop the message.
  const seen = [];
  const c = new client.McpClient(scriptedTransport(async (req) => {
    seen.push(req);
    if (req.method === 'initialize') {
      return { jsonrpc: '2.0', id: req.id, result: { protocolVersion: '2025-06-18' } };
    }
    return null;
  }));
  await c.initialize();
  const note = seen.find((r) => r.method === 'notifications/initialized');
  truthy(note, 'the notification should have been sent');
  eq('id' in note, false, 'a notification must not carry an id');
});

await check('request ids are unique across calls', async () => {
  const ids = [];
  const c = new client.McpClient(scriptedTransport(async (req) => {
    if (req.id !== undefined) ids.push(req.id);
    if (req.method === 'initialize') {
      return { jsonrpc: '2.0', id: req.id, result: { protocolVersion: '2025-06-18' } };
    }
    if (req.id === undefined) return null;
    return { jsonrpc: '2.0', id: req.id, result: { content: [], isError: false } };
  }));
  await c.initialize();
  await c.callTool('a', {});
  await c.callTool('b', {});
  eq(new Set(ids).size, ids.length, 'ids must not repeat — correlation depends on it');
});

await check('A NON-TEXT CONTENT BLOCK IS NAMED, never silently dropped', async () => {
  // Found by mutation. Our own server always emits `structuredContent`, so no
  // interop test reaches this path — but a third-party server need not, and
  // dropping an image block makes a tool that returned something look like a
  // tool that returned nothing. The agent would then reason about an absence
  // that is not real.
  const c = new client.McpClient(scriptedTransport(async (req) => {
    if (req.method === 'initialize') {
      return { jsonrpc: '2.0', id: req.id, result: { protocolVersion: '2025-06-18' } };
    }
    if (req.id === undefined) return null;
    return {
      jsonrpc: '2.0',
      id: req.id,
      result: {
        content: [
          { type: 'text', text: 'here is the chart' },
          { type: 'image', data: 'base64...', mimeType: 'image/png' },
        ],
        isError: false,
      },
    };
  }));
  await c.initialize();
  const res = await c.callTool('render', {});
  match(res.content, /here is the chart/, 'text blocks must survive');
  match(res.content, /image/, 'a non-text block must be named, not dropped');
  match(res.content, /not rendered/, 'and marked as unrendered rather than implied absent');
});

await check('a malformed content block is named rather than crashing', async () => {
  const c = new client.McpClient(scriptedTransport(async (req) => {
    if (req.method === 'initialize') {
      return { jsonrpc: '2.0', id: req.id, result: { protocolVersion: '2025-06-18' } };
    }
    if (req.id === undefined) return null;
    return { jsonrpc: '2.0', id: req.id, result: { content: ['not an object', null], isError: false } };
  }));
  await c.initialize();
  const res = await c.callTool('weird', {});
  match(res.content, /not an object/, 'a junk block must be reported, not thrown on');
});

// ── effect classification ───────────────────────────────────────────────────

await check('THE SERVER DOES NOT GET TO CLASSIFY ITS OWN BLAST RADIUS', async () => {
  // The kernel refuses the model's word on effect for this reason. A remote
  // server is further outside the trust boundary than the model: an attacker
  // who controls the server controls the annotation.
  const surface = client.describeToolSurface(
    [{ name: 'delete_everything', annotations: { readOnlyHint: true } }],
    { delete_everything: 'write' }
  );
  eq(surface[0].effect, 'write', "the server's claim overrode the operator's classification");
  truthy(surface[0].disagreement, 'the disagreement must be surfaced');
  match(surface[0].disagreement, /self-report/, 'and named for what it is');
  eq(surface[0].serverClaims.readOnlyHint, true, 'the claim is still recorded as evidence');
});

await check('a destructive hint over a read classification is flagged the other way', async () => {
  const surface = client.describeToolSurface(
    [{ name: 'looks_harmless', annotations: { destructiveHint: true } }],
    { looks_harmless: 'read' }
  );
  eq(surface[0].effect, 'read', 'the operator still wins');
  match(surface[0].disagreement, /worth a second look/, 'but this direction costs something');
});

await check('an unclassified tool is UNKNOWN, which spends write budget', async () => {
  // With the default tools.max_writes_per_session of 0, an unclassified tool is
  // unusable until someone classifies it. That pressure is the point: the map
  // is how an operator states what they have decided.
  const surface = client.describeToolSurface([{ name: 'mystery' }], {});
  eq(surface[0].effect, 'unknown', 'unlisted must be unknown, never read');
  eq(client.unclassifiedTools(surface), ['mystery'], 'and it must be reportable');
  eq(surface[0].disagreement, undefined, 'no claim, no disagreement');
});

await check('agreement produces no disagreement noise', async () => {
  const surface = client.describeToolSurface(
    [{ name: 'read_it', annotations: { readOnlyHint: true } }],
    { read_it: 'read' }
  );
  eq(surface[0].disagreement, undefined, 'agreeing annotations should be quiet');
});

// ── the dispatcher ──────────────────────────────────────────────────────────

await check('mcpDispatcher satisfies the loop port and adds no authorization', async () => {
  // Authorization lives in the loop's policy gate and the Authorizer. A
  // dispatcher that also decided permissions would be a third copy of the rule.
  const c = await connected();
  const tools = await c.listTools();
  const dispatcher = client.mcpDispatcher(c);
  const res = await dispatcher.call({ id: 'x', name: tools[0].name, args: {} });
  eq(typeof res.content, 'string', 'the dispatcher must return a DispatchResult');
});

// ── report ──────────────────────────────────────────────────────────────────

rmSync(outDir, { recursive: true, force: true });

console.log(`\nmcp-client: ${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}
console.log('All mcp-client checks passed.');
