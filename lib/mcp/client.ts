// lib/mcp/client.ts — the MCP CLIENT, and the loop's tool surface.
//
// THE DIRECTION WAS INVERTED. `lib/mcp/server.ts` exposes Trinity's fleet AS
// MCP tools: Trinity is the tool *provider*, and `executeTool` is single-shot
// dispatch serving somebody else's agent. An agent loop needs the opposite —
// Trinity as the *consumer* — and that was the one genuinely new module in
// docs/AGENT-LOOP-SCOPE.md rather than wiring between things already built.
//
// Hand-rolled for the same three reasons `jsonrpc.ts` gives, which have not
// changed: this repo's builds break on import-time dependency work, five
// methods do not carry an SDK, and the bytes on the wire stay auditable.
//
// ── THE DISTINCTION THIS FILE EXISTS TO GET RIGHT ────────────────────────────
//
// Three wire outcomes, three different facts, and collapsing any two of them is
// the bug:
//
//   the tool ran and succeeded          -> ok
//   the tool ran and failed             -> error      (the model sees it, adapts)
//   the tool could not be reached       -> UNAVAILABLE (nothing was learned)
//
// `tools.unavailable_is_not_checked` is CONSTITUTIONAL — no layer may turn it
// off — and its stated reason is this repo's own history: *"a blocked host is
// NOT CHECKED, not FAILED. Reading it as failure is how a proxy 403 became a
// credential rotation."* A transport that reports a refused connection as a
// tool error tells the agent its call was answered. It was not.
//
// So every transport failure surfaces as `unavailable`, which the loop turns
// into a ceiling of NOT_CHECKED. The agent cannot certify a run in which it
// could not reach the thing it was certifying.
//
// ── WHAT THIS CLIENT REFUSES TO BELIEVE ──────────────────────────────────────
//
// MCP lets a server annotate its own tools: `readOnlyHint`, `destructiveHint`.
// **Those are not used to classify effect.** A remote server declaring its own
// tool harmless is self-report deciding blast radius, which is exactly what the
// kernel refuses when it looks effect up rather than taking it from the call —
// and a server is less trustworthy than the model, not more.
//
// The hints are surfaced as EVIDENCE by `describeToolSurface()`, alongside the
// operator's classification, with disagreements named. A server claiming
// read-only for something the operator classified as a write is worth seeing;
// it is never worth obeying.

import {
  RPC,
  envelopeError,
  type RpcRequest,
  type RpcResponse,
  type RpcId,
} from './jsonrpc';
import type { ToolCall, ToolEffect, DispatchResult, ToolDispatcher } from '../trustshell/harness/loop';

/**
 * Moves one JSON-RPC message and returns the reply.
 *
 * A PORT, so the protocol logic is testable with no network — which is not a
 * convenience here: `repid-engine-production.up.railway.app`,
 * `qnnpjhlxljtqyigedwkb.supabase.co` and `trinity-litellm.railway.app` are all
 * proxy-denied from a sandboxed session, so an implementation that could only
 * be exercised over a real socket could not be exercised at all.
 *
 * CONTRACT, and the whole file depends on it:
 *
 *   - Return the decoded JSON reply for anything the server actually answered,
 *     INCLUDING a JSON-RPC error object. That is an answer.
 *   - THROW for anything that prevented an answer: connection refused, DNS
 *     failure, TLS failure, proxy 403, timeout, non-2xx HTTP, unparseable body.
 *     Those become `unavailable`.
 *   - Return `null` only for a notification, which has no reply by spec.
 *
 * A transport that swallows a timeout and returns a synthetic error object
 * breaks the distinction this file exists for, and nothing downstream can
 * recover it.
 */
export interface McpTransport {
  send(request: RpcRequest): Promise<unknown>;
}

export interface McpToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface McpToolDescriptor {
  name: string;
  description?: string;
  inputSchema?: unknown;
  annotations?: McpToolAnnotations;
}

export const CLIENT_INFO = { name: 'trinity-agent-loop', version: '0.1.0' } as const;

/**
 * The protocol version this client speaks.
 *
 * Pinned rather than "latest". A client that accepts whatever the server offers
 * has no version negotiation at all, it has version capitulation.
 */
export const CLIENT_PROTOCOL_VERSION = '2025-06-18';

export class McpProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpProtocolError';
    // Same downlevel hazard as ToolInputError: tsconfig sets no `target`, so a
    // built-in subclass loses its prototype chain and `instanceof` silently
    // returns false. See jsonrpc.ts — this was found by a smoke test, not by
    // reading.
    Object.setPrototypeOf(this, McpProtocolError.prototype);
  }
}

// ---------------------------------------------------------------------------

export class McpClient {
  private nextId = 1;
  private initialized = false;
  private serverInfo: { name?: string; version?: string } | undefined;
  private negotiatedVersion: string | undefined;

  constructor(private readonly transport: McpTransport) {}

  /**
   * `initialize`, then the `notifications/initialized` notification.
   *
   * The notification carries NO id. The spec forbids a reply to it, and
   * server.ts returns null for exactly that reason — sending an id would make a
   * conforming server either violate the spec or drop the message.
   */
  async initialize(): Promise<{ protocolVersion: string; serverInfo?: { name?: string; version?: string } }> {
    const result = await this.request('initialize', {
      protocolVersion: CLIENT_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: CLIENT_INFO,
    });

    const r = asRecord(result, 'initialize result');
    const version = typeof r.protocolVersion === 'string' ? r.protocolVersion : undefined;
    if (!version) {
      throw new McpProtocolError('server did not return a protocolVersion from initialize');
    }
    this.negotiatedVersion = version;
    this.serverInfo = isRecord(r.serverInfo)
      ? { name: strOrUndefined(r.serverInfo.name), version: strOrUndefined(r.serverInfo.version) }
      : undefined;

    await this.notify('notifications/initialized');
    this.initialized = true;
    return { protocolVersion: version, serverInfo: this.serverInfo };
  }

  get info(): { protocolVersion?: string; serverInfo?: { name?: string; version?: string } } {
    return { protocolVersion: this.negotiatedVersion, serverInfo: this.serverInfo };
  }

  async listTools(): Promise<McpToolDescriptor[]> {
    this.assertInitialized('tools/list');
    const result = asRecord(await this.request('tools/list'), 'tools/list result');
    if (!Array.isArray(result.tools)) {
      throw new McpProtocolError('tools/list did not return a `tools` array');
    }
    return result.tools.map((raw, i) => {
      const t = asRecord(raw, `tools[${i}]`);
      if (typeof t.name !== 'string' || t.name.length === 0) {
        throw new McpProtocolError(`tools[${i}] has no usable name`);
      }
      const d: McpToolDescriptor = { name: t.name };
      if (typeof t.description === 'string') d.description = t.description;
      if (t.inputSchema !== undefined) d.inputSchema = t.inputSchema;
      if (isRecord(t.annotations)) d.annotations = t.annotations as McpToolAnnotations;
      return d;
    });
  }

  /**
   * Call a tool, and map the outcome onto the loop's three states.
   *
   * NEVER THROWS for anything the server answered. The loop treats a thrown
   * dispatcher as a tool error, which would flatten "unreachable" into "failed"
   * — the exact collapse this file exists to prevent. So transport failures are
   * caught here and returned as `unavailable`.
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<DispatchResult> {
    let result: unknown;
    try {
      result = await this.request('tools/call', { name, arguments: args });
    } catch (e) {
      if (e instanceof McpRpcError) {
        // The server ANSWERED, with a protocol-level error. The call was
        // received and refused — a real answer about this call, so the agent
        // sees it and may adapt. Not `unavailable`.
        return { content: `MCP error ${e.code}: ${e.message}`, error: true };
      }
      // Nothing answered. Connection refused, proxy 403, timeout, garbage body.
      // NOT a failed tool call — the agent learned nothing about the tool.
      return {
        content:
          `${name} could not be reached: ${(e as Error).message}. This is NOT a tool ` +
          'failure — nothing was learned about the call, so the run cannot be certified ' +
          'on the strength of it.',
        unavailable: true,
      };
    }

    const r = asRecord(result, 'tools/call result');
    return {
      content: extractContent(r),
      // `isError: true` on a successful RPC is MCP's way of saying the tool ran
      // and failed, deliberately so the model sees the message and can correct
      // itself rather than losing the turn to a runtime error. See jsonrpc.ts's
      // ToolInputError note — this is the client half of that decision.
      error: r.isError === true,
    };
  }

  // -- envelope handling ----------------------------------------------------

  private async request(method: string, params?: unknown): Promise<unknown> {
    const id: RpcId = this.nextId++;
    const req: RpcRequest = params === undefined
      ? { jsonrpc: '2.0', id, method }
      : { jsonrpc: '2.0', id, method, params };

    const raw = await this.transport.send(req);
    const envelopeIssue = envelopeErrorForResponse(raw);
    if (envelopeIssue) throw new McpProtocolError(`${method}: ${envelopeIssue}`);

    const res = raw as RpcResponse;
    // ID CORRELATION IS NOT OPTIONAL. A reply carrying a different id is a
    // corrupt or interleaved stream, and accepting it attributes one tool's
    // result to another tool's call — which would be invisible in every log
    // and wrong in a way the agent would act on.
    if (res.id !== id) {
      throw new McpProtocolError(
        `${method}: response id ${JSON.stringify(res.id)} does not match request id ${id}. ` +
          'Refusing rather than attributing this result to the wrong call.'
      );
    }
    if ('error' in res) throw new McpRpcError(res.error.code, res.error.message, res.error.data);
    return res.result;
  }

  private async notify(method: string, params?: unknown): Promise<void> {
    const req: RpcRequest = params === undefined
      ? { jsonrpc: '2.0', method }
      : { jsonrpc: '2.0', method, params };
    await this.transport.send(req);
  }

  private assertInitialized(method: string): void {
    if (!this.initialized) {
      throw new McpProtocolError(
        `${method} called before initialize(). The handshake is not ceremony — it is ` +
          'where the protocol version is agreed, and a call made before it may be ' +
          'interpreted under a version neither side chose.'
      );
    }
  }
}

/** A JSON-RPC error object returned by the server. Distinct from a transport failure. */
export class McpRpcError extends Error {
  constructor(readonly code: number, message: string, readonly data?: unknown) {
    super(message);
    this.name = 'McpRpcError';
    Object.setPrototypeOf(this, McpRpcError.prototype);
  }
}

// ---------------------------------------------------------------------------
// The loop's dispatcher
// ---------------------------------------------------------------------------

/**
 * Adapt an `McpClient` to the loop's `ToolDispatcher` port.
 *
 * Note what is NOT here: no authorization. The loop checks every call against
 * its policy gate and the `Authorizer` BEFORE dispatch, so a dispatcher that
 * also decided permissions would be a third place authorization lives, and
 * three copies of a rule disagree at least as silently as two.
 */
export function mcpDispatcher(client: McpClient): ToolDispatcher {
  return {
    async call(call: ToolCall): Promise<DispatchResult> {
      return client.callTool(call.name, call.args);
    },
  };
}

// ---------------------------------------------------------------------------
// Effect classification — evidence, not obedience
// ---------------------------------------------------------------------------

export interface ToolSurfaceEntry {
  name: string;
  /** What the OPERATOR classified it as. This is what the loop enforces on. */
  effect: ToolEffect;
  /** What the SERVER claims about itself. Recorded, never obeyed. */
  serverClaims?: McpToolAnnotations;
  /**
   * Set when the server's claim is more permissive than the operator's
   * classification — the direction that matters.
   */
  disagreement?: string;
}

/**
 * Reconcile the operator's effect map against the server's self-description.
 *
 * WHY NOT JUST TRUST `readOnlyHint`. It is the server describing its own blast
 * radius. The kernel already refuses the model's word on this for the same
 * reason, and a remote server is further outside the trust boundary than the
 * model is — an attacker who controls the server controls the annotation.
 *
 * Unlisted tools are `unknown`, which SPENDS WRITE BUDGET. With the default
 * `tools.max_writes_per_session` of 0, an unclassified tool is therefore
 * unusable until someone classifies it. That is the intended pressure: the map
 * is how an operator states what they have decided.
 */
export function describeToolSurface(
  tools: McpToolDescriptor[],
  toolEffects: Readonly<Record<string, ToolEffect>>
): ToolSurfaceEntry[] {
  return tools.map((t) => {
    const effect = toolEffects[t.name] ?? 'unknown';
    const entry: ToolSurfaceEntry = { name: t.name, effect };
    if (t.annotations) entry.serverClaims = t.annotations;

    const claimsHarmless = t.annotations?.readOnlyHint === true;
    if (claimsHarmless && effect !== 'read') {
      entry.disagreement =
        `the server annotates '${t.name}' as read-only, but the operator classified it ` +
        `as '${effect}'. The operator's classification is what is enforced — a server ` +
        'describing its own blast radius is self-report, and an attacker who controls ' +
        'the server controls the annotation.';
    }
    if (t.annotations?.destructiveHint === true && effect === 'read') {
      entry.disagreement =
        `the server annotates '${t.name}' as DESTRUCTIVE and the operator classified it ` +
        'as a read. The operator wins, and this one is worth a second look — the two ' +
        'disagree in the direction that costs something.';
    }
    return entry;
  });
}

/** Tools the operator has not classified. Each is `unknown`, so each spends write budget. */
export function unclassifiedTools(surface: ToolSurfaceEntry[]): string[] {
  return surface.filter((e) => e.effect === 'unknown').map((e) => e.name);
}

// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asRecord(v: unknown, what: string): Record<string, unknown> {
  if (!isRecord(v)) throw new McpProtocolError(`${what} is not a JSON object`);
  return v;
}

function strOrUndefined(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/**
 * Validate a RESPONSE envelope.
 *
 * `envelopeError` in jsonrpc.ts validates a REQUEST — it requires `method`,
 * which no response carries. Reusing it here would reject every valid reply, so
 * the shared parts are reused and the response-specific rule is stated here.
 */
function envelopeErrorForResponse(value: unknown): string | null {
  if (!isRecord(value)) return 'response must be a JSON object';
  if (value.jsonrpc !== '2.0') return "field `jsonrpc` must be exactly '2.0'";
  if (!('id' in value)) return 'response must carry an `id`';
  const id = value.id;
  if (!(typeof id === 'string' || typeof id === 'number' || id === null)) {
    return 'field `id` must be a string, number, or null';
  }
  const hasResult = 'result' in value;
  const hasError = 'error' in value;
  if (hasResult === hasError) {
    // Both or neither. The spec allows exactly one, and a reply carrying both
    // is ambiguous in the worst way: a reader that checks `error` first sees a
    // failure, one that checks `result` first sees a success.
    return 'response must carry exactly one of `result` or `error`';
  }
  if (hasError) {
    if (!isRecord(value.error)) return '`error` must be an object';
    if (typeof value.error.code !== 'number') return '`error.code` must be a number';
    if (typeof value.error.message !== 'string') return '`error.message` must be a string';
  }
  return null;
}

/**
 * Pull readable text out of a CallToolResult.
 *
 * `structuredContent` is preferred when present because server.ts emits both
 * from one payload precisely so they cannot disagree. Non-text content blocks
 * are NAMED rather than dropped — silently discarding an image block would
 * make a tool that returned something look like a tool that returned nothing.
 */
function extractContent(result: Record<string, unknown>): string {
  if (result.structuredContent !== undefined) {
    return JSON.stringify(result.structuredContent, null, 2);
  }
  if (!Array.isArray(result.content)) {
    return JSON.stringify(result, null, 2);
  }
  const parts = result.content.map((block, i) => {
    if (!isRecord(block)) return `[content[${i}]: not an object]`;
    if (block.type === 'text' && typeof block.text === 'string') return block.text;
    return `[content[${i}]: ${typeof block.type === 'string' ? block.type : 'unknown'} block, not rendered]`;
  });
  return parts.join('\n');
}

/** Re-exported so callers can name the codes they branch on. */
export { RPC };
