// lib/mcp/server.ts — the MCP method dispatcher.
//
// Pure: takes a parsed JSON-RPC message plus a context, returns a response
// object or null (for notifications). No HTTP, no Next, no Supabase. That is
// what makes the protocol exercisable from a plain node script without a
// running server — see scripts/mcp-fleet-smoke.mjs.
//
// This repo's standing rule is "run it; don't read it" (CLAUDE.md). A protocol
// implementation that can only be tested by deploying it is one that will be
// claimed correct without being run.

import {
  RPC,
  type RpcId,
  type RpcRequest,
  type RpcResponse,
  ToolInputError,
  fail,
  isNotification,
  ok,
} from '@/lib/mcp/jsonrpc';
import { READ_TOOLS, WRITE_TOOLS, type ToolContext, executeTool, toolsFor } from '@/lib/mcp/fleet';

/** Every tool name this server implements, regardless of who may call it. */
const ALL_TOOL_NAMES: ReadonlySet<string> = new Set(
  [...READ_TOOLS, ...WRITE_TOOLS].map((t) => t.name)
);

export const SERVER_INFO = {
  name: 'trinity-fleet',
  title: 'Trinity Fleet Discovery',
  version: '0.1.0',
} as const;

/**
 * Protocol versions this server knows how to speak, newest first.
 *
 * Negotiation rule from the spec: echo the client's version when we support
 * it; otherwise answer with our own latest and let the client decide whether
 * to proceed. We only hard-error on a syntactically absent version, because
 * refusing an unknown-but-newer date string strands clients that would in
 * practice interoperate fine with a read-only tool server.
 */
export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
export const PREFERRED_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

export function negotiateProtocolVersion(requested: unknown): string {
  if (typeof requested === 'string' && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)) {
    return requested;
  }
  return PREFERRED_PROTOCOL_VERSION;
}

function asArgs(params: unknown): Record<string, unknown> {
  if (typeof params !== 'object' || params === null || Array.isArray(params)) return {};
  const args = (params as Record<string, unknown>).arguments;
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return {};
  return args as Record<string, unknown>;
}

/**
 * Handle one JSON-RPC message.
 *
 * Returns null when the message is a notification — the spec forbids a
 * response, and returning one is a real interop bug rather than noise.
 */
export async function handleRpc(msg: RpcRequest, ctx: ToolContext): Promise<RpcResponse | null> {
  const id: RpcId = msg.id ?? null;

  switch (msg.method) {
    case 'initialize': {
      const params = (msg.params ?? {}) as Record<string, unknown>;
      return ok(id, {
        protocolVersion: negotiateProtocolVersion(params.protocolVersion),
        // Only what we actually implement. Advertising listChanged without
        // emitting the notification is a small lie the client will act on.
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions:
          'Fleet discovery for the Trinity agent network. Liveness is tri-state: ' +
          '`is_live` is true or null and never false, because absence of a heartbeat is ' +
          'not evidence a node is down. Route work by `dispatchable`; describe state by ' +
          '`is_live`. Every node carries the evidence its status rests on.',
      });
    }

    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null;

    case 'ping':
      return ok(id, {});

    case 'tools/list':
      return ok(id, { tools: toolsFor(ctx.principal) });

    case 'tools/call': {
      const params = (msg.params ?? {}) as Record<string, unknown>;
      const name = params.name;
      if (typeof name !== 'string' || name.length === 0) {
        return fail(id, RPC.INVALID_PARAMS, 'Field `params.name` must be a non-empty string.');
      }

      // Genuinely unknown names stop here. A name that exists but is not in
      // this principal's list falls through to executeTool, which answers with
      // an actionable permission error instead of "unknown tool" — a service
      // caller that forgot x-internal-secret otherwise spends its time
      // debugging a typo it did not make. The tool names are in the repo and
      // the docs, so this reveals nothing that was hidden.
      const known = ALL_TOOL_NAMES.has(name);
      if (!known) {
        return ok(id, toolResult({ error: `Unknown tool '${name}'.` }, true));
      }

      try {
        const outcome = await executeTool(name, asArgs(params), ctx);
        return ok(id, toolResult(outcome.payload, outcome.isError ?? false));
      } catch (e) {
        // Bad input comes back as a tool error so the model can self-correct;
        // everything else is a genuine protocol-level failure.
        if (e instanceof ToolInputError) {
          return ok(id, toolResult({ error: e.message }, true));
        }
        const message = e instanceof Error ? e.message : 'Unknown error';
        return fail(id, RPC.INTERNAL_ERROR, `Tool '${name}' failed: ${message}`);
      }
    }

    default:
      if (isNotification(msg)) return null;
      return fail(id, RPC.METHOD_NOT_FOUND, `Method '${msg.method}' is not supported.`);
  }
}

/**
 * Build a CallToolResult.
 *
 * The spec wants `content` for models that read text and `structuredContent`
 * for programmatic callers; we emit both from one payload so they can never
 * disagree with each other.
 */
export function toolResult(payload: Record<string, unknown>, isError: boolean) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
    isError,
  };
}
