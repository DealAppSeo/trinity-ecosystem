// MCP-001 — the tool menu a principal is shown must equal the tools it can run.
//
// THREAT (folded in from Tencent AI-Infra-Guard, `data/mcp/` — the
// `mcp_tool_rug_pull` and `mcp_excessive_permissions` detectors). MCP's trust
// model is consent-then-call: a client reads `tools/list`, a human or policy
// APPROVES that menu, and only then does the client `tools/call`. The load-bearing
// assumption is that the tool the client approved is the tool that runs — and,
// just as important, that nothing the client was NOT shown can run. A "rug pull"
// breaks the first half (a tool mutates, or a hidden tool appears, after approval);
// "excessive permissions" breaks the second (a privileged tool the menu omits is
// still callable). Both collapse to one checkable invariant on OUR server:
//
//   for each principal, the ADVERTISED set (tools/list) == the EFFECTIVE-AUTHORITY
//   set (the tools whose handler a tools/call actually reaches, rather than being
//   turned away for lack of authority).
//
// WHY THIS SERVER CAN DRIFT. The two surfaces are computed in two places
// (lib/mcp/fleet.ts): visibility by `toolsFor(principal)`, and the write gate by
// `executeTool`'s `principal !== 'service'` refusal. Nothing but this probe pins
// them equal. A future edit that gates one and not the other — a hardcoded write
// set here, a new tool added to the switch but not the table there — opens exactly
// the gap AIG names: a caller running a mutating tool it was never offered, on an
// endpoint that holds the service key and therefore the whole database.
//
// WHAT THIS JUDGES — executed, not read. It compiles lib/mcp and drives the real
// request path (`handleRpc`) as BOTH principals against an in-memory source, then:
//
//   HELD        for user and service alike, ADVERTISED == EFFECTIVE-AUTHORITY, and
//               no write tool is either advertised to or executable by a `user`.
//               The approved menu is the effective authority.
//   BREACHED    some tool is executable-but-unadvertised for a principal (a hidden
//               tool it never approved — the rug pull), or advertised-but-refused
//               (a menu that lies), or a write tool leaks to the user principal on
//               either surface (privilege). Captured with the exact tool + principal.
//   NOT_CHECKED lib/mcp will not compile/import, or the server no longer exports the
//               handles this drives. A module that will not build has told us nothing
//               about whether it is exploitable — never a pass, never a breach.
//
// Authority, not input validity: a call rejected for a MISSING ARGUMENT still
// REACHED its handler (the read tool answered), so it counts as executable. Only
// the "requires the service principal" refusal means authority turned the call away.
//
// SCOPE. This judges the tools the server DECLARES (READ_TOOLS ∪ WRITE_TOOLS); a
// tool implemented entirely outside those tables is unreachable through handleRpc
// (it answers "Unknown tool" before dispatch), which is the safe behaviour and is
// itself asserted. Read-only, no secrets, no network.

import { compileAliasedModules } from '../compile.mjs';
import { held, breached, notChecked } from '../harness.mjs';

const MCP_FILES = ['lib/mcp/jsonrpc.ts', 'lib/mcp/fleet.ts', 'lib/mcp/server.ts'];
const SERVICE_REFUSAL = 'requires the service principal';

export default {
  id: 'MCP-001',
  title: 'The MCP tool menu a principal is shown must equal what it can run (no rug-pull)',
  component: 'MCP fleet server / lib/mcp',
  severity: 'High',
  threat:
    'If the advertised tool set and the effectively-executable tool set disagree for a principal, a caller can run a mutating tool it was never offered (rug-pull) or be blocked from one it was — on an endpoint holding the service key.',

  async run() {
    const c = await compileAliasedModules(MCP_FILES, ['server', 'fleet']);
    if (!c.ok) return notChecked(c.reason, c.howToRun);

    const [server, fleet] = c.modules;
    const need = { 'server.handleRpc': server.handleRpc, 'fleet.READ_TOOLS': fleet.READ_TOOLS, 'fleet.WRITE_TOOLS': fleet.WRITE_TOOLS };
    const missing = Object.entries(need).filter(([, v]) => v === undefined).map(([k]) => k);
    if (missing.length) {
      c.cleanup();
      return notChecked(
        `lib/mcp no longer exports ${missing.join(', ')}`,
        're-point this probe at the current MCP server exports (handleRpc, READ_TOOLS, WRITE_TOOLS)'
      );
    }

    const readNames = fleet.READ_TOOLS.map((t) => t.name);
    const writeNames = fleet.WRITE_TOOLS.map((t) => t.name);
    const universe = [...new Set([...readNames, ...writeNames])];

    // In-memory source: the invariant is about authority, not about what the DB
    // holds, so the rows are irrelevant. touchHeartbeat true so a write that DID
    // reach its handler returns cleanly rather than an error we might misread.
    const source = {
      listNodes: async () => [],
      upsertNode: async () => {},
      touchHeartbeat: async () => true,
    };
    const ctx = (principal) => ({ source, principal, now: new Date('2026-09-02T12:00:00.000Z') });

    const advertised = async (principal) => {
      const res = await server.handleRpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, ctx(principal));
      return (res?.result?.tools ?? []).map((t) => t.name);
    };

    // Reached its handler = authority let it through. Only the service-principal
    // refusal means authority blocked it; a missing-argument error is the handler
    // talking, so it still counts as reached.
    const reaches = async (name, principal) => {
      const res = await server.handleRpc(
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: {} } },
        ctx(principal)
      );
      const err = res?.result?.structuredContent?.error ?? res?.error?.message ?? '';
      return !String(err).includes(SERVICE_REFUSAL);
    };

    const breaches = [];
    const transcript = [];

    for (const principal of ['user', 'service']) {
      const adv = new Set(await advertised(principal));
      const exec = new Set();
      for (const name of universe) if (await reaches(name, principal)) exec.add(name);

      transcript.push(`principal=${principal}`);
      transcript.push(`  advertised (tools/list)      : ${[...adv].sort().join(', ') || '(none)'}`);
      transcript.push(`  effective authority (reached): ${[...exec].sort().join(', ') || '(none)'}`);

      // Rug pull: a tool it can run that it was never shown.
      for (const name of exec) {
        if (!adv.has(name)) {
          breaches.push(
            `${principal} can EXECUTE '${name}' but it is NOT in that principal's tools/list — ` +
            `a tool the client never approved still runs (rug-pull / hidden authority)`
          );
        }
      }
      // Phantom: a tool it was shown but is refused.
      for (const name of adv) {
        if (!exec.has(name)) {
          breaches.push(
            `${principal} is ADVERTISED '${name}' but its tools/call is refused for authority — ` +
            `the menu offers a tool the principal cannot use (phantom entry)`
          );
        }
      }
    }

    // Privilege floor, asserted independently of the set-equality above: a write
    // tool leaking into BOTH the user's menu and the user's reach would satisfy
    // set-equality while being a straight privilege escalation. So writes must be
    // service-only on BOTH surfaces.
    const userAdv = new Set(await advertised('user'));
    for (const name of writeNames) {
      if (userAdv.has(name)) {
        breaches.push(`write tool '${name}' is advertised to the user principal (excessive permissions)`);
      }
      if (await reaches(name, 'user')) {
        breaches.push(`write tool '${name}' is executable by the user principal (excessive permissions)`);
      }
    }

    // The declared-universe guarantee: a name outside the tables is not silently
    // dispatchable through the wire path. Asserting it keeps "Unknown tool" as the
    // answer, so a future switch-only tool cannot become a shadow executable.
    {
      const ghost = '__mcp001_unlisted_tool__';
      const reachedGhost = await reaches(ghost, 'service');
      const res = await server.handleRpc(
        { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: ghost, arguments: {} } },
        ctx('service')
      );
      const answeredUnknown = String(res?.result?.structuredContent?.error ?? '').toLowerCase().includes('unknown tool');
      transcript.push('');
      transcript.push(`unlisted-name call as service -> ${answeredUnknown ? "answered 'Unknown tool' (safe)" : 'REACHED a handler'}`);
      if (reachedGhost && !answeredUnknown) {
        breaches.push(
          `a name absent from READ_TOOLS/WRITE_TOOLS ('${ghost}') reached a handler instead of 'Unknown tool' — ` +
          `the declared table is no longer the boundary of what executes`
        );
      }
    }

    c.cleanup();

    if (breaches.length > 0) {
      return breached(
        `${breaches.length} tool-authority divergence(s): advertised menu ≠ effective authority`,
        [
          ...breaches.map((b) => `  BREACH  ${b}`),
          '',
          'driven through lib/mcp/server.ts handleRpc (tools/list vs tools/call), both principals:',
          ...transcript.map((t) => `    ${t}`),
        ].join('\n')
      );
    }

    return held(
      `advertised menu equals effective authority for both principals; ` +
        `${writeNames.length} write tool(s) service-only on both surfaces; unlisted names answer 'Unknown tool'`,
      transcript.join('\n')
    );
  },
};
